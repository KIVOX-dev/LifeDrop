import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/common';
import { BloodRequirement, RequirementNotification } from '../models';
import { REQ_STATUSES } from '../models/BloodRequirement';
import { audit } from '../services/common.service';
import { dispatchRequirement, publishRequirement, requirementStats } from '../services/requirement.service';
import { ApiError, asyncHandler, created, escapeRegex, ok, pageMeta, paginate } from '../utils/common';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models';
import { bloodGroup, idParams, pageQuery, requirementSchema } from './schemas';

const router = Router();
const admin = [authenticate, authorize('ADMIN', 'SUPER_ADMIN')];

/** Sets req.user when a valid token is present; anonymous requests continue without it. */
async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next();
  try {
    const p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET, { issuer: 'lifedrop' }) as jwt.JwtPayload;
    const u = await User.findById(p.sub).select('role isActive deletedAt email fullName').lean();
    if (u && u.isActive && !u.deletedAt) req.user = { id: String(u._id), role: u.role as any, email: u.email, fullName: u.fullName };
  } catch {
    /* treat as anonymous */
  }
  next();
}

const isStaff = (req: Request) => req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';

/** Anonymous visitors do not see individual contact details. */
const publicView = (r: any, loggedIn: boolean) => {
  if (loggedIn) return r;
  const { contactPerson, contactPhone, contactEmail, createdBy, ...rest } = r;
  return rest;
};

router.get(
  '/',
  optionalAuth,
  validate({
    query: pageQuery.extend({
      status: z.enum(REQ_STATUSES).optional(),
      bloodGroup: z.enum([...bloodGroup.options, 'ALL']).optional(),
      city: z.string().trim().max(80).optional(),
      urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      search: z.string().trim().max(100).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const staff = isStaff(req);
    const filter: Record<string, any> = { deletedAt: null };
    if (staff) {
      if (q.status) filter.status = q.status;
    } else {
      filter.status = 'PUBLISHED';
      filter.lastDateToRespond = { $gte: new Date() };
    }
    if (q.bloodGroup) filter.bloodGroup = q.bloodGroup;
    if (q.urgency) filter.urgency = q.urgency;
    if (q.city) filter.city = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ title: rx }, { hospitalName: rx }, { city: rx }];
    }
    const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
    const [items, total] = await Promise.all([
      BloodRequirement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BloodRequirement.countDocuments(filter),
    ]);
    if (!staff) items.sort((a, b) => urgencyOrder[a.urgency as string] - urgencyOrder[b.urgency as string]);
    ok(res, items.map((i) => (staff ? i : publicView(i, !!req.user))), pageMeta(page, limit, total));
  }),
);

router.post(
  '/create',
  ...admin,
  validate({ body: requirementSchema }),
  asyncHandler(async (req, res) => {
    const r = await BloodRequirement.create({ ...req.body, contactEmail: req.body.contactEmail || undefined, createdBy: req.user!.id });
    await audit(req, 'REQUIREMENT_CREATED', 'BloodRequirement', r._id);
    created(res, r);
  }),
);

router.get(
  '/:id',
  optionalAuth,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const staff = isStaff(req);
    const r = await BloodRequirement.findOne({ _id: req.params.id, deletedAt: null, ...(staff ? {} : { status: 'PUBLISHED' }) }).lean();
    if (!r) throw ApiError.notFound('Requirement not found');
    ok(res, staff ? r : publicView(r, !!req.user));
  }),
);

router.patch(
  '/:id',
  ...admin,
  validate({ params: idParams, body: requirementSchema.partial() }),
  asyncHandler(async (req, res) => {
    const r = await BloodRequirement.findOne({ _id: req.params.id, deletedAt: null });
    if (!r) throw ApiError.notFound('Requirement not found');
    if (r.status === 'CLOSED') throw ApiError.conflict('A closed requirement cannot be edited');
    if (r.status === 'PUBLISHED' && req.body.bloodGroup && req.body.bloodGroup !== r.bloodGroup) {
      throw ApiError.conflict('The target blood group cannot be changed after publishing; close it and create a new requirement');
    }
    r.set({ ...req.body, ...(req.body.contactEmail === '' ? { contactEmail: undefined } : {}) });
    await r.save();
    await audit(req, 'REQUIREMENT_UPDATED', 'BloodRequirement', r._id);
    ok(res, r);
  }),
);

router.post(
  '/:id/publish',
  ...admin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const out = await publishRequirement(req.params.id);
    await audit(req, 'REQUIREMENT_PUBLISHED', 'BloodRequirement', req.params.id, { queued: out.newlyQueued });
    ok(res, { requirement: out.requirement, emailsQueued: out.newlyQueued });
  }),
);

router.post(
  '/:id/close',
  ...admin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const r = await BloodRequirement.findOneAndUpdate({ _id: req.params.id, status: { $in: ['DRAFT', 'PUBLISHED'] }, deletedAt: null }, { status: 'CLOSED', closedAt: new Date() }, { returnDocument: 'after' });
    if (!r) throw ApiError.conflict('Requirement not found or already closed');
    await audit(req, 'REQUIREMENT_CLOSED', 'BloodRequirement', r._id);
    ok(res, r);
  }),
);

router.delete(
  '/:id',
  ...admin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const r = await BloodRequirement.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { deletedAt: new Date(), ...({} as object) }, { returnDocument: 'after' });
    if (!r) throw ApiError.notFound('Requirement not found');
    if (r.status === 'PUBLISHED') await BloodRequirement.updateOne({ _id: r._id }, { status: 'CLOSED', closedAt: new Date() });
    await audit(req, 'REQUIREMENT_DELETED', 'BloodRequirement', r._id);
    ok(res, { message: 'Requirement deleted' });
  }),
);

/** Delivery statistics + per-recipient breakdown (recipient emails are masked list-wide only for admins). */
router.get(
  '/:id/notifications',
  ...admin,
  validate({ params: idParams, query: pageQuery.extend({ status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED']).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const stats = await requirementStats(req.params.id);
    const filter: Record<string, unknown> = { requirement: req.params.id, ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      RequirementNotification.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('donor', 'fullName email').lean(),
      RequirementNotification.countDocuments(filter),
    ]);
    ok(res, { stats, items }, pageMeta(page, limit, total));
  }),
);

/** Re-run dispatch for newly eligible donors. Never duplicates (unique requirement+donor). */
router.post(
  '/:id/notifications',
  ...admin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const out = await dispatchRequirement(req.params.id);
    await audit(req, 'REQUIREMENT_REDISPATCHED', 'BloodRequirement', req.params.id, out);
    ok(res, out);
  }),
);

export default router;
