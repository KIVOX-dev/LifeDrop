import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { sensitiveLimiter, validate } from '../middleware/common';
import { AdminActivityLog, BloodRequirement, Certificate, Donation, DonorProfile, EmailLog, PointsTransaction, Reminder, User } from '../models';
import { EMAIL_STATUSES, EMAIL_TEMPLATES } from '../models/EmailLog';
import { REMINDER_STATUSES } from '../models/Reminder';
import { analytics, dashboardStats } from '../services/analytics.service';
import { revokeAllForUser } from '../services/auth.service';
import { audit, getSettings, updateSettings } from '../services/common.service';
import { requeueStaleEmails } from '../services/email.service';
import { enqueueEmailJob } from '../services/queue';
import { cancelReminderForDonation, rescheduleReminder } from '../services/reminder.service';
import { ApiError, asyncHandler, created, escapeRegex, ok, pageMeta, paginate } from '../utils/common';
import { toCsv } from '../utils/csv';
import { email, idParams, pageQuery, password } from './schemas';
import { env } from '../config/env';

const router = Router();
const admin = [authenticate, authorize('ADMIN', 'SUPER_ADMIN')];
const superAdmin = [authenticate, authorize('SUPER_ADMIN')];

const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

router.get('/dashboard', ...admin, asyncHandler(async (_req, res) => ok(res, await dashboardStats())));

router.get(
  '/analytics',
  ...admin,
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => ok(res, await analytics(req.query as any))),
);

/* ---------------------------------------- reports ---------------------------------------- */
const REPORTS = ['donors', 'donations', 'certificates', 'points', 'requirements', 'emails'] as const;

router.get(
  '/reports',
  ...admin,
  validate({ query: rangeQuery.extend({ type: z.enum(REPORTS), format: z.enum(['csv', 'json']).default('csv') }) }),
  asyncHandler(async (req, res) => {
    const { type, from, to, format } = req.query as any as { type: (typeof REPORTS)[number]; from?: Date; to?: Date; format: string };
    const dm = (f: string) => (from || to ? { [f]: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {});
    const LIMIT = 50_000;
    let rows: Record<string, unknown>[] = [];
    if (type === 'donors') {
      const ps = await DonorProfile.find(dm('createdAt')).limit(LIMIT).populate('user', 'fullName email isActive emailVerified').lean();
      rows = ps.map((p: any) => ({ name: p.user?.fullName, email: p.user?.email, phone: p.phone, bloodGroup: p.bloodGroup, city: p.city, state: p.state, country: p.country, active: p.user?.isActive, emailVerified: p.user?.emailVerified, available: p.isAvailable, points: p.totalPoints, verifiedDonations: p.totalVerifiedDonations, registeredAt: p.createdAt }));
    } else if (type === 'donations') {
      const ds = await Donation.find({ deletedAt: null, ...dm('donationDate') }).limit(LIMIT).populate('donor', 'fullName email').lean();
      rows = ds.map((d: any) => ({ donor: d.donor?.fullName, email: d.donor?.email, donationDate: d.donationDay, location: d.location, bloodGroup: d.bloodGroup, status: d.status, remarks: d.adminRemarks, verifiedAt: d.verifiedAt }));
    } else if (type === 'certificates') {
      const cs = await Certificate.find({ deletedAt: null, ...dm('createdAt') }).limit(LIMIT).populate('donor', 'fullName email').populate('reviewedBy', 'fullName').lean();
      rows = cs.map((c: any) => ({ donor: c.donor?.fullName, email: c.donor?.email, status: c.status, reason: c.rejectionReason, reviewedBy: c.reviewedBy?.fullName, reviewedAt: c.reviewedAt, submittedAt: c.createdAt }));
    } else if (type === 'points') {
      const ps = await PointsTransaction.find(dm('createdAt')).limit(LIMIT).populate('user', 'fullName email').lean();
      rows = ps.map((p: any) => ({ donor: p.user?.fullName, email: p.user?.email, type: p.type, points: p.points, at: p.createdAt }));
    } else if (type === 'requirements') {
      const rs = await BloodRequirement.find({ deletedAt: null, ...dm('createdAt') }).limit(LIMIT).lean();
      rows = rs.map((r) => ({ title: r.title, bloodGroup: r.bloodGroup, hospital: r.hospitalName, city: r.city, state: r.state, units: r.unitsRequired, urgency: r.urgency, status: r.status, deadline: r.lastDateToRespond, createdAt: r.createdAt }));
    } else {
      const es = await EmailLog.find(dm('createdAt')).limit(LIMIT).lean();
      rows = es.map((e) => ({ to: e.to, template: e.template, status: e.status, attempts: e.attempts, error: e.lastError, sentAt: e.sentAt, deliveredAt: e.deliveredAt, createdAt: e.createdAt }));
    }
    await audit(req, 'REPORT_EXPORTED', 'Report', type, { format, rows: rows.length });
    if (format === 'json') return ok(res, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lifedrop-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + toCsv(rows));
  }),
);

/* ----------------------------------- user / admin management ----------------------------------- */
router.get(
  '/users',
  ...admin,
  validate({ query: pageQuery.extend({ role: z.enum(['ADMIN', 'SUPER_ADMIN', 'DONOR']).optional(), search: z.string().trim().max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    // Only super admins may list administrator accounts.
    const role = q.role ?? (req.user!.role === 'SUPER_ADMIN' ? undefined : 'DONOR');
    if (role && role !== 'DONOR' && req.user!.role !== 'SUPER_ADMIN') throw ApiError.forbidden('Only a super admin can view administrators');
    const filter: Record<string, unknown> = { deletedAt: null, ...(role ? { role } : {}) };
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ fullName: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
    ok(res, items.map(({ passwordHash, ...u }: any) => u), pageMeta(page, limit, total));
  }),
);

router.post(
  '/users',
  ...superAdmin,
  sensitiveLimiter,
  validate({ body: z.object({ fullName: z.string().trim().min(2).max(100), email, password, role: z.enum(['ADMIN', 'SUPER_ADMIN']).default('ADMIN') }) }),
  asyncHandler(async (req, res) => {
    if (await User.exists({ email: req.body.email })) throw ApiError.conflict('An account with this email already exists');
    const u = await User.create({ fullName: req.body.fullName, email: req.body.email, role: req.body.role, emailVerified: true, passwordHash: await bcrypt.hash(req.body.password, 12), createdBy: req.user!.id });
    await audit(req, 'ADMIN_CREATED', 'User', u._id, { role: u.role });
    created(res, u);
  }),
);

router.patch(
  '/users/:id',
  ...superAdmin,
  validate({ params: idParams, body: z.object({ isActive: z.boolean().optional(), role: z.enum(['ADMIN', 'SUPER_ADMIN']).optional() }) }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw ApiError.badRequest('You cannot modify your own administrator account');
    const u = await User.findOne({ _id: req.params.id, role: { $in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null });
    if (!u) throw ApiError.notFound('Administrator not found');
    if (req.body.role) u.role = req.body.role;
    if (typeof req.body.isActive === 'boolean') u.isActive = req.body.isActive;
    await u.save();
    if (!u.isActive) await revokeAllForUser(String(u._id));
    await audit(req, 'ADMIN_UPDATED', 'User', u._id, req.body);
    ok(res, u);
  }),
);

/* ------------------------------------------ settings ------------------------------------------ */
router.get('/settings', ...admin, asyncHandler(async (_req, res) => ok(res, { settings: await getSettings(), integrations: env.integrations, timezone: env.APP_TIMEZONE })));

router.put(
  '/settings',
  ...superAdmin,
  validate({
    body: z.object({
      reminderMonths: z.number().int().min(1).max(12).optional(),
      registrationsOpen: z.boolean().optional(),
      contactEmail: z.union([email, z.literal('')]).optional(),
      contactPhone: z.string().trim().max(30).optional(),
      contactAddress: z.string().trim().max(300).optional(),
      announcement: z.string().trim().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const s = await updateSettings(req.body, req.user!.id);
    await audit(req, 'SETTINGS_UPDATED', 'SystemSetting', undefined, req.body);
    ok(res, s);
  }),
);

/* ------------------------------------------ audit ------------------------------------------ */
router.get(
  '/activity-logs',
  ...admin,
  validate({ query: pageQuery.extend({ action: z.string().trim().max(60).optional(), actor: z.string().regex(/^[a-f\d]{24}$/i).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const filter: Record<string, unknown> = { ...(q.action ? { action: q.action } : {}), ...(q.actor ? { actor: q.actor } : {}) };
    const [items, total] = await Promise.all([
      AdminActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'fullName email').lean(),
      AdminActivityLog.countDocuments(filter),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

/* ------------------------------------------ email logs ------------------------------------------ */
router.get(
  '/email-logs',
  ...admin,
  validate({ query: pageQuery.extend({ status: z.enum(EMAIL_STATUSES).optional(), template: z.enum(EMAIL_TEMPLATES).optional(), search: z.string().trim().max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const filter: Record<string, unknown> = { ...(q.status ? { status: q.status } : {}), ...(q.template ? { template: q.template } : {}), ...(q.search ? { to: new RegExp(escapeRegex(q.search), 'i') } : {}) };
    const [items, total] = await Promise.all([EmailLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), EmailLog.countDocuments(filter)]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

router.post(
  '/email-logs/:id/retry',
  ...admin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const log = await EmailLog.findOneAndUpdate({ _id: req.params.id, status: { $in: ['FAILED', 'QUEUED', 'RETRYING'] } }, { status: 'QUEUED', lastError: null });
    if (!log) throw ApiError.conflict('Only failed or pending emails can be retried');
    await enqueueEmailJob(`${log._id}`).catch(() => undefined);
    await audit(req, 'EMAIL_RETRIED', 'EmailLog', log._id);
    ok(res, { message: 'Email re-queued' });
  }),
);

router.post('/email-logs/requeue-stale', ...admin, asyncHandler(async (_req, res) => ok(res, { requeued: await requeueStaleEmails(0) })));

/* ------------------------------------------ reminders ------------------------------------------ */
router.get(
  '/reminders',
  ...admin,
  validate({ query: pageQuery.extend({ status: z.enum(REMINDER_STATUSES).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const filter = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      Reminder.find(filter).sort({ scheduledFor: 1 }).skip(skip).limit(limit).populate('donor', 'fullName email').populate('donation', 'donationDate donationDay location status').lean(),
      Reminder.countDocuments(filter),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

router.post(
  '/reminders/:id/cancel',
  ...admin,
  validate({ params: idParams, body: z.object({ reason: z.string().trim().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const r = await Reminder.findById(req.params.id);
    if (!r) throw ApiError.notFound('Reminder not found');
    const out = await cancelReminderForDonation(r.donation, req.body.reason ?? 'Cancelled by administrator', req.user!.id);
    if (!out) throw ApiError.conflict('Only scheduled reminders can be cancelled');
    await audit(req, 'REMINDER_CANCELLED', 'Reminder', r._id);
    ok(res, out);
  }),
);

router.patch(
  '/reminders/:id',
  ...admin,
  validate({ params: idParams, body: z.object({ scheduledFor: z.coerce.date() }) }),
  asyncHandler(async (req, res) => {
    const r = await rescheduleReminder(req.params.id, req.body.scheduledFor);
    await audit(req, 'REMINDER_RESCHEDULED', 'Reminder', r._id, { scheduledFor: r.scheduledFor });
    ok(res, r);
  }),
);

export default router;
