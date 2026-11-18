import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { uploadLimiter, validate } from '../middleware/common';
import { uploadSingle } from '../middleware/upload';
import { Certificate, Donation, DonorProfile, Notification, PointsTransaction, Reminder, User } from '../models';
import { revokeAllForUser } from '../services/auth.service';
import { audit, notify, notifyAdmins } from '../services/common.service';
import { queueEmail } from '../services/email.service';
import { leaderboard, myRank } from '../services/points.service';
import { cancelReminderForDonation } from '../services/reminder.service';
import { randomKey, storage } from '../services/storage.service';
import { ApiError, asyncHandler, escapeRegex, ok, pageMeta, paginate, randomToken } from '../utils/common';
import { bloodGroup, idParams, pageQuery, profileUpdateSchema } from './schemas';
import bcrypt from 'bcrypt';

const router = Router();
const donorOnly = [authenticate, authorize('DONOR')];
const adminOnly = [authenticate, authorize('ADMIN', 'SUPER_ADMIN')];

/* ------------------------------- donor self-service ------------------------------- */
router.get(
  '/profile',
  ...donorOnly,
  asyncHandler(async (req, res) => {
    const [user, profile, rank] = await Promise.all([
      User.findById(req.user!.id),
      DonorProfile.findOne({ user: req.user!.id }).lean(),
      myRank(req.user!.id),
    ]);
    if (!profile) throw ApiError.notFound('Profile not found');
    ok(res, { user, profile, rank });
  }),
);

router.patch(
  '/profile',
  ...donorOnly,
  validate({ body: profileUpdateSchema }),
  asyncHandler(async (req, res) => {
    const { fullName, privacy, preferences, emergencyContact, ...rest } = req.body;
    const set: Record<string, unknown> = { ...rest };
    for (const [k, v] of Object.entries(privacy ?? {})) set[`privacy.${k}`] = v;
    for (const [k, v] of Object.entries(preferences ?? {})) set[`preferences.${k}`] = v;
    if (emergencyContact) for (const [k, v] of Object.entries(emergencyContact)) set[`emergencyContact.${k}`] = v;
    if (fullName) await User.updateOne({ _id: req.user!.id }, { fullName });
    const profile = await DonorProfile.findOneAndUpdate({ user: req.user!.id }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
    ok(res, { user: await User.findById(req.user!.id), profile });
  }),
);

router.post(
  '/profile/picture',
  ...donorOnly,
  uploadLimiter,
  ...uploadSingle('picture', { allowPdf: false }),
  asyncHandler(async (req, res) => {
    const f = req.validatedFile!;
    const profile = await DonorProfile.findOne({ user: req.user!.id });
    if (!profile) throw ApiError.notFound('Profile not found');
    const key = randomKey('avatars', f.mimeType);
    await storage.upload(key, f.buffer, f.mimeType);
    const old = profile.profilePictureKey;
    profile.profilePictureKey = key;
    await profile.save();
    if (old) await storage.remove(old).catch(() => undefined);
    ok(res, { updated: true });
  }),
);

router.get(
  '/profile/picture',
  ...donorOnly,
  asyncHandler(async (req, res) => {
    const p = await DonorProfile.findOne({ user: req.user!.id }).select('profilePictureKey').lean();
    ok(res, { url: p?.profilePictureKey ? (await storage.signedUrl(p.profilePictureKey, { inline: true, filename: 'avatar' })).url : null });
  }),
);

router.patch(
  '/availability',
  ...donorOnly,
  validate({ body: z.object({ isAvailable: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const p = await DonorProfile.findOneAndUpdate({ user: req.user!.id }, { isAvailable: req.body.isAvailable }, { returnDocument: 'after' }).lean();
    ok(res, { isAvailable: p?.isAvailable });
  }),
);

router.get(
  '/donations',
  ...donorOnly,
  validate({ query: pageQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query as any);
    const filter = { donor: req.user!.id, deletedAt: null };
    const [items, total, reminders] = await Promise.all([
      Donation.find(filter).sort({ donationDate: -1 }).skip(skip).limit(limit).populate('certificate', 'status rejectionReason originalName reviewedAt mimeType').lean(),
      Donation.countDocuments(filter),
      Reminder.find({ donor: req.user!.id, status: 'SCHEDULED' }).sort({ scheduledFor: 1 }).limit(1).lean(),
    ]);
    ok(res, { items, nextReminder: reminders[0] ? { scheduledFor: reminders[0].scheduledFor } : null }, pageMeta(page, limit, total));
  }),
);

router.get(
  '/leaderboard',
  ...donorOnly,
  asyncHandler(async (req, res) => {
    const [top, rank] = await Promise.all([leaderboard({ period: 'overall', page: 1, limit: 10 }, req.user!.id), myRank(req.user!.id)]);
    ok(res, { top: top.entries, me: rank });
  }),
);

router.get(
  '/my-data',
  ...donorOnly,
  asyncHandler(async (req, res) => {
    const id = req.user!.id;
    const [user, profile, donations, points, notifications] = await Promise.all([
      User.findById(id).lean(),
      DonorProfile.findOne({ user: id }).lean(),
      Donation.find({ donor: id }).lean(),
      PointsTransaction.find({ user: id }).lean(),
      Notification.find({ user: id }).lean(),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="lifedrop-my-data.json"');
    ok(res, { exportedAt: new Date(), user, profile, donations, points, notifications });
  }),
);

router.post(
  '/deletion-request',
  ...donorOnly,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { deletionRequestedAt: new Date() });
    await notifyAdmins('Account deletion requested', `${req.user!.fullName} requested deletion of their account.`, [['Donor', req.user!.email]], `/admin/donors/${req.user!.id}`);
    ok(res, { message: 'Your deletion request has been sent to the administrators.' });
  }),
);

router.delete(
  '/deletion-request',
  ...donorOnly,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $unset: { deletionRequestedAt: 1 } });
    ok(res, { message: 'Deletion request cancelled' });
  }),
);

/* --------------------------------------- admin --------------------------------------- */
const listQuery = pageQuery.extend({
  search: z.string().trim().max(100).optional(),
  bloodGroup: bloodGroup.optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  deletionRequested: z.enum(['true']).optional(),
});

router.get(
  '/',
  ...adminOnly,
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const userFilter: Record<string, unknown> = { role: 'DONOR', deletedAt: null };
    if (q.isActive) userFilter.isActive = q.isActive === 'true';
    if (q.deletionRequested) userFilter.deletionRequestedAt = { $exists: true };
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      userFilter.$or = [{ fullName: rx }, { email: rx }];
    }
    const profileFilter: Record<string, unknown> = {};
    if (q.bloodGroup) profileFilter.bloodGroup = q.bloodGroup;
    if (q.city) profileFilter.city = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
    if (q.state) profileFilter.state = new RegExp(`^${escapeRegex(q.state)}$`, 'i');

    const userIds = await User.find(userFilter).distinct('_id');
    profileFilter.user = { $in: userIds };
    const [profiles, total] = await Promise.all([
      DonorProfile.find(profileFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'fullName email isActive emailVerified deletionRequestedAt createdAt').lean(),
      DonorProfile.countDocuments(profileFilter),
    ]);
    ok(res, profiles, pageMeta(page, limit, total));
  }),
);

router.get(
  '/:id',
  ...adminOnly,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'DONOR', deletedAt: null });
    if (!user) throw ApiError.notFound('Donor not found');
    const [profile, donations, points, rank] = await Promise.all([
      DonorProfile.findOne({ user: user._id }).lean(),
      Donation.find({ donor: user._id, deletedAt: null }).sort({ donationDate: -1 }).populate('certificate', 'status rejectionReason originalName mimeType').lean(),
      PointsTransaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      myRank(String(user._id)),
    ]);
    ok(res, { user, profile, donations, points, rank });
  }),
);

router.patch(
  '/:id/status',
  ...adminOnly,
  validate({ params: idParams, body: z.object({ isActive: z.boolean(), reason: z.string().trim().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'DONOR', deletedAt: null });
    if (!user) throw ApiError.notFound('Donor not found');
    user.isActive = req.body.isActive;
    await user.save();
    if (!req.body.isActive) await revokeAllForUser(String(user._id));
    await notify(user._id, 'ACCOUNT', req.body.isActive ? 'Account activated' : 'Account deactivated', req.body.reason ?? 'Your account status was changed by an administrator.');
    await queueEmail({ to: user.email, toName: user.fullName, userId: user._id, template: 'ACCOUNT_STATUS', data: { name: user.fullName, active: user.isActive, reason: req.body.reason } });
    await audit(req, user.isActive ? 'DONOR_ACTIVATED' : 'DONOR_DEACTIVATED', 'User', user._id, { reason: req.body.reason });
    ok(res, user);
  }),
);

/** Fulfil an account deletion: removes personal data and stored files, keeps anonymous aggregates. */
router.delete(
  '/:id',
  ...adminOnly,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'DONOR', deletedAt: null });
    if (!user) throw ApiError.notFound('Donor not found');
    const id = user._id;
    const [certs, profile, donations] = await Promise.all([
      Certificate.find({ donor: id, deletedAt: null }).select('storageKey').lean(),
      DonorProfile.findOne({ user: id }),
      Donation.find({ donor: id }).select('_id').lean(),
    ]);
    for (const c of certs) await storage.remove(c.storageKey).catch(() => undefined);
    if (profile?.profilePictureKey) await storage.remove(profile.profilePictureKey).catch(() => undefined);
    await Promise.all(donations.map((d) => cancelReminderForDonation(d._id, 'Account deleted')));
    await Certificate.updateMany({ donor: id }, { deletedAt: new Date(), status: 'REJECTED', originalName: 'removed' });
    await Donation.updateMany({ donor: id }, { $set: { deletedAt: new Date() } });
    await Promise.all([DonorProfile.deleteOne({ user: id }), Notification.deleteMany({ user: id }), revokeAllForUser(String(id))]);
    user.fullName = 'Deleted donor';
    user.email = `deleted-${id}@deleted.invalid`;
    user.passwordHash = await bcrypt.hash(randomToken(), 10);
    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();
    await audit(req, 'DONOR_DELETED', 'User', id);
    ok(res, { message: 'Donor data removed' });
  }),
);

export default router;
