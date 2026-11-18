import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { Donation, Reminder, User } from '../models';
import { ApiError } from '../utils/common';
import { logger } from '../utils/logger';
import { clientUrl, getSettings, notify } from './common.service';
import { queueEmail } from './email.service';
import { removeReminderJob, scheduleReminderJob } from './queue';
import { unsubscribeUrl } from './unsubscribe';

/** Follow-up time: N calendar months after the donation day, 09:00 in the configured timezone. */
export const computeReminderDate = (donationDay: string, months: number, tz = env.APP_TIMEZONE) =>
  DateTime.fromISO(donationDay, { zone: tz }).plus({ months }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();

const ELAPSED_GRACE_MS = 30 * 24 * 3600_000;

async function pushJob(id: string, runAt: Date) {
  try {
    await scheduleReminderJob(id, runAt);
  } catch (err: any) {
    // Reminder stays SCHEDULED in MongoDB; the maintenance sweep re-creates the queue job.
    logger.error({ err: err.message, reminderId: id }, 'could not enqueue reminder job; sweep will recover');
  }
}

/** Create or update the single reminder for a verified donation (idempotent). */
export async function scheduleReminderForDonation(donationId: Types.ObjectId | string) {
  const donation = await Donation.findById(donationId);
  if (!donation || donation.status !== 'VERIFIED') return null;
  const { reminderMonths } = await getSettings();
  const runAt = computeReminderDate(donation.donationDay, Number(reminderMonths) || 3);
  const tz = env.APP_TIMEZONE;

  const existing = await Reminder.findOne({ donation: donation._id });
  if (existing?.status === 'SENT') return existing; // never send twice

  const elapsed = runAt.getTime() < Date.now() - ELAPSED_GRACE_MS;
  const status = elapsed ? 'CANCELLED' : 'SCHEDULED';
  const reminder = await Reminder.findOneAndUpdate(
    { donation: donation._id },
    {
      $set: { donor: donation.donor, scheduledFor: runAt, timezone: tz, status, ...(elapsed ? { cancelReason: 'Reminder window already elapsed' } : {}) },
      $unset: { lastError: 1, ...(elapsed ? {} : { cancelReason: 1, cancelledBy: 1 }) },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  if (elapsed) await removeReminderJob(String(reminder._id)).catch(() => undefined);
  else await pushJob(String(reminder._id), runAt);
  return reminder;
}

export async function cancelReminderForDonation(donationId: Types.ObjectId | string, reason: string, adminId?: string) {
  const r = await Reminder.findOneAndUpdate(
    { donation: donationId, status: 'SCHEDULED' },
    { status: 'CANCELLED', cancelReason: reason, ...(adminId ? { cancelledBy: adminId } : {}) },
    { returnDocument: 'after' },
  );
  if (r) await removeReminderJob(String(r._id)).catch((e) => logger.error({ err: e.message }, 'remove reminder job'));
  return r;
}

export async function rescheduleReminder(reminderId: string, newDate: Date) {
  if (newDate.getTime() < Date.now()) throw ApiError.badRequest('New reminder time must be in the future');
  const r = await Reminder.findById(reminderId);
  if (!r) throw ApiError.notFound('Reminder not found');
  if (r.status === 'SENT') throw ApiError.conflict('This reminder was already sent');
  const donation = await Donation.findById(r.donation);
  if (!donation || donation.status !== 'VERIFIED') throw ApiError.conflict('The donation is no longer verified');
  r.scheduledFor = newDate;
  r.status = 'SCHEDULED';
  r.cancelReason = undefined;
  r.cancelledBy = undefined;
  await r.save();
  await pushJob(String(r._id), newDate);
  return r;
}

/** Queue worker + sweep entry point. Idempotent. */
export async function processReminder(reminderId: string) {
  const r = await Reminder.findById(reminderId);
  if (!r || r.status !== 'SCHEDULED') return 'skipped';
  if (r.scheduledFor.getTime() > Date.now() + 60_000) {
    await pushJob(reminderId, r.scheduledFor); // rescheduled while waiting
    return 'deferred';
  }
  const [donation, donor] = await Promise.all([Donation.findById(r.donation), User.findById(r.donor)]);
  if (!donation || donation.status !== 'VERIFIED' || donation.deletedAt || !donor || donor.deletedAt || !donor.isActive) {
    r.status = 'CANCELLED';
    r.cancelReason = 'Donation or account no longer valid';
    await r.save();
    return 'cancelled';
  }
  // Atomic claim so duplicate jobs can never send twice.
  const claimed = await Reminder.findOneAndUpdate({ _id: r._id, status: 'SCHEDULED' }, { status: 'SENT', sentAt: new Date() });
  if (!claimed) return 'skipped';
  try {
    const log = await queueEmail({
      to: donor.email,
      toName: donor.fullName,
      userId: donor._id,
      template: 'DONATION_FOLLOWUP',
      category: 'NON_ESSENTIAL',
      dedupeKey: `followup:${r._id}`,
      data: {
        name: donor.fullName,
        donationDate: donation.donationDate,
        url: clientUrl('/dashboard/requirements'),
        unsubscribeUrl: unsubscribeUrl(String(donor._id)),
      },
    });
    await Reminder.updateOne({ _id: r._id }, { emailLog: log?._id });
    await notify(donor._id, 'DONATION_REMINDER', 'Time to check your eligibility', 'About three months have passed since your donation. Ask your blood bank or doctor whether you can donate again.', '/dashboard/requirements');
    return 'sent';
  } catch (err: any) {
    await Reminder.updateOne({ _id: r._id }, { status: 'SCHEDULED', $unset: { sentAt: 1 }, lastError: String(err.message).slice(0, 300) });
    throw err;
  }
}
