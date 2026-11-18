import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { Certificate, Donation, DonorProfile, User } from '../models';
import { ApiError, BloodGroup, POINTS_PER_DONATION } from '../utils/common';
import { clientUrl, notify } from './common.service';
import { queueEmail } from './email.service';
import { awardPoints, reversePoints } from './points.service';
import { cancelReminderForDonation, scheduleReminderForDonation } from './reminder.service';
import { randomKey, storage } from './storage.service';
import { ValidatedFile } from '../middleware/upload';
import { logger } from '../utils/logger';

export interface Actor { id: string; role: string }

/** Validate a YYYY-MM-DD donation day against the app timezone: not in the future, not absurdly old. */
export function parseDonationDay(input: string) {
  const day = input.slice(0, 10);
  const dt = DateTime.fromISO(day, { zone: env.APP_TIMEZONE });
  if (!dt.isValid) throw ApiError.badRequest('Invalid donation date');
  const today = DateTime.now().setZone(env.APP_TIMEZONE).startOf('day');
  if (dt.startOf('day') > today) throw ApiError.badRequest('Donation date cannot be in the future');
  if (dt < today.minus({ years: 5 })) throw ApiError.badRequest('Donation date is too far in the past');
  // Store at 12:00 UTC of that civil day so it renders as the same date in every timezone.
  return { donationDay: day, donationDate: new Date(`${day}T12:00:00.000Z`) };
}

/* ----------------------------------- submission ----------------------------------- */
export async function submitCertificate(
  donorId: string,
  file: ValidatedFile,
  input: { donationDate: string; location: string; bloodGroup?: BloodGroup },
) {
  const { donationDay, donationDate } = parseDonationDay(input.donationDate);
  const [user, profile] = await Promise.all([User.findById(donorId), DonorProfile.findOne({ user: donorId })]);
  if (!user || !profile) throw ApiError.notFound('Donor profile not found');

  if (await Donation.exists({ donor: donorId, donationDay, status: { $in: ['PENDING', 'VERIFIED'] }, deletedAt: null })) {
    throw ApiError.conflict('You already have a donation recorded for this date');
  }
  if (await Certificate.exists({ fileHash: file.hash, status: { $in: ['PENDING', 'APPROVED'] }, deletedAt: null })) {
    throw ApiError.conflict('This certificate file has already been submitted');
  }

  const key = randomKey('certificates', file.mimeType);
  await storage.upload(key, file.buffer, file.mimeType);

  let donation, cert;
  try {
    donation = await Donation.create({
      donor: donorId,
      donationDate,
      donationDay,
      location: input.location,
      bloodGroup: input.bloodGroup ?? profile.bloodGroup,
    });
    cert = await Certificate.create({
      donor: donorId,
      donation: donation._id,
      storageKey: key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      fileHash: file.hash,
    });
    donation.certificate = cert._id;
    await donation.save();
  } catch (err: any) {
    // Roll back partial state so nothing is orphaned (object, donation record).
    await storage.remove(key).catch((e) => logger.error({ err: e.message, key }, 'cleanup of orphaned object failed'));
    if (donation) await Donation.deleteOne({ _id: donation._id });
    if (err?.code === 11000) throw ApiError.conflict('This donation or certificate has already been submitted');
    throw err;
  }

  await notify(donorId, 'CERTIFICATE_SUBMITTED', 'Certificate submitted', 'Your certificate is pending review. Points are credited once it is approved.', '/dashboard/donations');
  await queueEmail({
    to: user.email,
    toName: user.fullName,
    userId: user._id,
    template: 'CERTIFICATE_SUBMITTED',
    data: { name: user.fullName, donationDate, location: input.location },
  });
  return { donation, certificate: cert };
}

/* --------------------------------- admin decisions --------------------------------- */
async function loadDonor(id: Types.ObjectId | string) {
  const u = await User.findById(id).select('email fullName').lean();
  if (!u) throw ApiError.notFound('Donor not found');
  return u;
}

export async function approveCertificate(certId: string, admin: Actor, remarks?: string) {
  // Atomic PENDING -> APPROVED transition: exactly one concurrent request can succeed.
  const cert = await Certificate.findOneAndUpdate(
    { _id: certId, status: 'PENDING', deletedAt: null },
    { status: 'APPROVED', reviewedBy: admin.id, reviewedAt: new Date(), $unset: { rejectionReason: 1 } },
    { returnDocument: 'after' },
  );
  if (!cert) {
    const exists = await Certificate.exists({ _id: certId, deletedAt: null });
    throw exists ? ApiError.conflict('This certificate has already been reviewed') : ApiError.notFound('Certificate not found');
  }
  const donation = await Donation.findOneAndUpdate(
    { _id: cert.donation, status: 'PENDING' },
    { status: 'VERIFIED', verifiedBy: admin.id, verifiedAt: new Date(), ...(remarks ? { adminRemarks: remarks } : {}) },
    { returnDocument: 'after' },
  );
  if (!donation) throw ApiError.conflict('Donation record is not pending');

  await awardPoints(donation, admin.id); // idempotent
  await scheduleReminderForDonation(donation._id);

  const donor = await loadDonor(donation.donor);
  await notify(donation.donor, 'CERTIFICATE_APPROVED', 'Certificate approved', `+${POINTS_PER_DONATION} points have been added to your account.`, '/dashboard/points');
  await queueEmail({
    to: donor.email,
    toName: donor.fullName,
    userId: donation.donor,
    template: 'CERTIFICATE_APPROVED',
    data: { name: donor.fullName, donationDate: donation.donationDate, location: donation.location, points: POINTS_PER_DONATION, url: clientUrl('/dashboard/points') },
  });
  return { certificate: cert, donation };
}

export async function rejectCertificate(certId: string, admin: Actor, reason: string) {
  const cert = await Certificate.findOneAndUpdate(
    { _id: certId, status: 'PENDING', deletedAt: null },
    { status: 'REJECTED', rejectionReason: reason, reviewedBy: admin.id, reviewedAt: new Date() },
    { returnDocument: 'after' },
  );
  if (!cert) {
    const exists = await Certificate.exists({ _id: certId, deletedAt: null });
    throw exists ? ApiError.conflict('This certificate has already been reviewed') : ApiError.notFound('Certificate not found');
  }
  const donation = await Donation.findOneAndUpdate(
    { _id: cert.donation, status: 'PENDING' },
    { status: 'REJECTED', adminRemarks: reason, verifiedBy: admin.id, verifiedAt: new Date() },
    { returnDocument: 'after' },
  );
  if (!donation) throw ApiError.conflict('Donation record is not pending');
  await notifyRejected(donation, reason);
  return { certificate: cert, donation };
}

async function notifyRejected(donation: { donor: Types.ObjectId; donationDate: Date }, reason: string) {
  const donor = await loadDonor(donation.donor);
  await notify(donation.donor, 'CERTIFICATE_REJECTED', 'Certificate not approved', reason.slice(0, 300), '/dashboard/upload');
  await queueEmail({
    to: donor.email,
    toName: donor.fullName,
    userId: donation.donor,
    template: 'CERTIFICATE_REJECTED',
    data: { name: donor.fullName, donationDate: donation.donationDate, reason, url: clientUrl('/dashboard/upload') },
  });
}

/** VERIFIED -> REJECTED: reverses points, cancels the reminder, tells the donor. */
export async function invalidateDonation(donationId: string, admin: Actor, reason: string) {
  const donation = await Donation.findOneAndUpdate(
    { _id: donationId, status: 'VERIFIED', deletedAt: null },
    { status: 'REJECTED', adminRemarks: reason, verifiedBy: admin.id, verifiedAt: new Date() },
    { returnDocument: 'after' },
  );
  if (!donation) throw ApiError.conflict('Only verified donations can be invalidated');
  await Certificate.updateOne({ donation: donation._id }, { status: 'REJECTED', rejectionReason: reason, reviewedBy: admin.id, reviewedAt: new Date() });
  await reversePoints(donation, admin.id);
  await cancelReminderForDonation(donation._id, 'Donation invalidated', admin.id);
  await notifyRejected(donation, reason);
  return donation;
}

/** Admin correction of donation details; keeps the reminder in sync. */
export async function correctDonation(
  donationId: string,
  patch: { donationDate?: string; location?: string; bloodGroup?: BloodGroup; adminRemarks?: string },
) {
  const donation = await Donation.findOne({ _id: donationId, deletedAt: null });
  if (!donation) throw ApiError.notFound('Donation not found');
  let dateChanged = false;
  if (patch.donationDate) {
    const { donationDay, donationDate } = parseDonationDay(patch.donationDate);
    if (donationDay !== donation.donationDay) {
      donation.donationDay = donationDay;
      donation.donationDate = donationDate;
      dateChanged = true;
    }
  }
  if (patch.location) donation.location = patch.location;
  if (patch.bloodGroup) donation.bloodGroup = patch.bloodGroup;
  if (patch.adminRemarks !== undefined) donation.adminRemarks = patch.adminRemarks;
  try {
    await donation.save();
  } catch (err: any) {
    if (err?.code === 11000) throw ApiError.conflict('The donor already has a donation on that date');
    throw err;
  }
  if (dateChanged && donation.status === 'VERIFIED') {
    await scheduleReminderForDonation(donation._id);
    const last = await Donation.findOne({ donor: donation.donor, status: 'VERIFIED' }).sort({ donationDate: -1 }).select('donationDate').lean();
    if (last) await DonorProfile.updateOne({ user: donation.donor }, { lastDonationDate: last.donationDate });
  }
  return donation;
}

/* ---------------------------------- deletion ---------------------------------- */
/** Donors may withdraw pending/rejected certificates; admins may delete rejected ones; super admins any. */
export async function deleteCertificate(certId: string, actor: Actor) {
  const cert = await Certificate.findOne({ _id: certId, deletedAt: null });
  if (!cert) throw ApiError.notFound('Certificate not found');
  const isOwner = String(cert.donor) === actor.id;
  if (actor.role === 'DONOR') {
    if (!isOwner) throw ApiError.forbidden();
    if (cert.status === 'APPROVED') throw ApiError.conflict('Approved certificates cannot be withdrawn. Contact an administrator.');
  } else if (cert.status === 'APPROVED') {
    if (actor.role !== 'SUPER_ADMIN') throw ApiError.forbidden('Only a super admin can delete an approved certificate');
    await invalidateDonation(String(cert.donation), actor, 'Certificate deleted by administrator');
  }
  await storage.remove(cert.storageKey);
  const now = new Date();
  await Certificate.updateOne({ _id: cert._id }, { deletedAt: now, status: 'REJECTED', rejectionReason: cert.rejectionReason ?? 'Withdrawn' });
  await Donation.updateOne({ _id: cert.donation, status: { $ne: 'VERIFIED' } }, { deletedAt: now, status: 'REJECTED', adminRemarks: 'Certificate removed' });
  return cert;
}
