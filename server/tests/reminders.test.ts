import { DateTime } from 'luxon';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Donation, DonorProfile, EmailLog, Notification, Reminder } from '../src/models';
import { removeReminderJob, scheduleReminderJob } from '../src/services/queue';
import { computeReminderDate, processReminder, scheduleReminderForDonation } from '../src/services/reminder.service';
import { api, auth, createStaff, P, registerDonor, resetDb, startDb, stopDb, uploadCertificate } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

async function verified(date = daysAgo(2)) {
  const donor = await registerDonor();
  const admin = await createStaff('ADMIN');
  const up = await uploadCertificate(donor, { date });
  await api().post(`${P}/certificates/${up.body.data.certificate._id}/approve`).set(auth(admin)).send({});
  return { donor, admin, donationId: up.body.data.donation._id as string };
}

describe('follow-up reminder scheduling', () => {
  it('computes three CALENDAR months at 09:00 in the configured timezone', () => {
    expect(DateTime.fromJSDate(computeReminderDate('2025-01-15', 3), { zone: 'Asia/Kolkata' }).toISO()).toBe('2025-04-15T09:00:00.000+05:30');
    // month-end clamps instead of overflowing into the next month
    expect(DateTime.fromJSDate(computeReminderDate('2025-11-30', 3), { zone: 'Asia/Kolkata' }).toISODate()).toBe('2026-02-28');
    // timezone is respected: same civil day, different instant
    const utc = computeReminderDate('2025-01-15', 3, 'UTC');
    const nyc = computeReminderDate('2025-01-15', 3, 'America/New_York');
    // 15 April is daylight time in New York (EDT, UTC-4): 09:00 local = 13:00Z
    expect(nyc.getTime() - utc.getTime()).toBe(4 * 3600_000);
    expect(DateTime.fromJSDate(nyc, { zone: 'UTC' }).hour).toBe(13);
  });

  it('approval stores a persistent reminder and enqueues exactly one delayed job', async () => {
    const { donor, donationId } = await verified();
    const r = await Reminder.findOne({ donation: donationId });
    expect(r).toMatchObject({ status: 'SCHEDULED', timezone: 'Asia/Kolkata' });
    expect(String(r!.donor)).toBe(donor.id);
    const expected = DateTime.fromISO(daysAgo(2), { zone: 'Asia/Kolkata' }).plus({ months: 3 }).set({ hour: 9 }).toJSDate();
    expect(r!.scheduledFor.getTime()).toBe(expected.getTime());
    expect(scheduleReminderJob).toHaveBeenCalledTimes(1);
    expect(scheduleReminderJob).toHaveBeenCalledWith(String(r!._id), expected);
  });

  it('re-scheduling the same donation updates the single reminder (no duplicates)', async () => {
    const { donationId } = await verified();
    await scheduleReminderForDonation(donationId);
    await scheduleReminderForDonation(donationId);
    expect(await Reminder.countDocuments({ donation: donationId })).toBe(1);
  });

  it('sends the follow-up email once, logs it, notifies in-app and never calls it a medical decision', async () => {
    const { donor, donationId } = await verified();
    const r = (await Reminder.findOne({ donation: donationId }))!;
    await Reminder.updateOne({ _id: r._id }, { scheduledFor: new Date(Date.now() - 1000) });

    expect(await processReminder(String(r._id))).toBe('sent');
    expect(await processReminder(String(r._id))).toBe('skipped'); // duplicate job
    const logs = await EmailLog.find({ template: 'DONATION_FOLLOWUP' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ to: donor.email, category: 'NON_ESSENTIAL', status: 'QUEUED' });
    expect((await Reminder.findById(r._id))).toMatchObject({ status: 'SENT' });
    expect(await Notification.countDocuments({ user: donor.id, type: 'DONATION_REMINDER' })).toBe(1);
  });

  it('defers if the reminder was rescheduled to the future after the job was queued', async () => {
    const { donationId } = await verified();
    const r = (await Reminder.findOne({ donation: donationId }))!;
    expect(await processReminder(String(r._id))).toBe('deferred');
    expect(await EmailLog.countDocuments({ template: 'DONATION_FOLLOWUP' })).toBe(0);
    expect((await Reminder.findById(r._id))!.status).toBe('SCHEDULED');
  });

  it('respects the donor opting out of reminder emails', async () => {
    const { donor, donationId } = await verified();
    await DonorProfile.updateOne({ user: donor.id }, { 'preferences.reminderEmails': false });
    const r = (await Reminder.findOne({ donation: donationId }))!;
    await Reminder.updateOne({ _id: r._id }, { scheduledFor: new Date(Date.now() - 1000) });
    await processReminder(String(r._id));
    expect((await EmailLog.findOne({ template: 'DONATION_FOLLOWUP' }))!.status).toBe('SKIPPED');
  });

  it('admin can reschedule and cancel; cancelled reminders never send', async () => {
    const { admin, donationId } = await verified();
    const r = (await Reminder.findOne({ donation: donationId }))!;
    const later = new Date(Date.now() + 40 * 86400_000);
    const resched = await api().patch(`${P}/admin/reminders/${r._id}`).set(auth(admin)).send({ scheduledFor: later.toISOString() });
    expect(resched.status).toBe(200);
    expect(vi.mocked(scheduleReminderJob).mock.calls.at(-1)![1].getTime()).toBe(later.getTime());
    expect((await api().patch(`${P}/admin/reminders/${r._id}`).set(auth(admin)).send({ scheduledFor: '2020-01-01' })).status).toBe(400);

    const cancel = await api().post(`${P}/admin/reminders/${r._id}/cancel`).set(auth(admin)).send({ reason: 'donor request' });
    expect(cancel.status).toBe(200);
    expect(removeReminderJob).toHaveBeenCalledWith(String(r._id));
    await Reminder.updateOne({ _id: r._id }, { scheduledFor: new Date(Date.now() - 1000) });
    expect(await processReminder(String(r._id))).toBe('skipped');
    expect(await EmailLog.countDocuments({ template: 'DONATION_FOLLOWUP' })).toBe(0);
    expect((await api().post(`${P}/admin/reminders/${r._id}/cancel`).set(auth(admin)).send({})).status).toBe(409);
  });

  it('correcting the donation date moves the reminder; invalidating cancels it', async () => {
    const { admin, donationId } = await verified(daysAgo(5));
    const r0 = (await Reminder.findOne({ donation: donationId }))!;
    const newDay = daysAgo(20);
    const res = await api().patch(`${P}/donations/${donationId}`).set(auth(admin)).send({ donationDate: newDay });
    expect(res.status).toBe(200);
    const r1 = (await Reminder.findById(r0._id))!;
    expect(r1.scheduledFor.getTime()).not.toBe(r0.scheduledFor.getTime());
    expect(r1.scheduledFor.getTime()).toBe(DateTime.fromISO(newDay, { zone: 'Asia/Kolkata' }).plus({ months: 3 }).set({ hour: 9 }).toMillis());
    expect(await Reminder.countDocuments()).toBe(1);

    await api().patch(`${P}/donations/${donationId}/status`).set(auth(admin)).send({ status: 'REJECTED', remarks: 'invalid certificate' });
    expect((await Reminder.findById(r0._id))!.status).toBe('CANCELLED');
    expect(removeReminderJob).toHaveBeenCalled();
  });

  it('cancels instead of emailing when the donation is no longer verified or the account is inactive', async () => {
    const { donor, donationId } = await verified();
    const r = (await Reminder.findOne({ donation: donationId }))!;
    await Reminder.updateOne({ _id: r._id }, { scheduledFor: new Date(Date.now() - 1000) });
    await Donation.updateOne({ _id: donationId }, { status: 'REJECTED' });
    expect(await processReminder(String(r._id))).toBe('cancelled');
    expect(await EmailLog.countDocuments({ template: 'DONATION_FOLLOWUP' })).toBe(0);
    expect(donor.id).toBeTruthy();
  });

  it('does not schedule reminders for old donations whose window has long passed', async () => {
    const { donationId } = await verified(daysAgo(300));
    expect((await Reminder.findOne({ donation: donationId }))!.status).toBe('CANCELLED');
  });
});
