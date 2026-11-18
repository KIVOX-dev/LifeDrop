import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/common';
import { Donation, User } from '../models';
import { DONATION_STATUSES } from '../models/Donation';
import { audit } from '../services/common.service';
import { approveCertificate, correctDonation, invalidateDonation, rejectCertificate } from '../services/donation.service';
import { Certificate } from '../models';
import { ApiError, asyncHandler, escapeRegex, ok, pageMeta, paginate } from '../utils/common';
import { bloodGroup, idParams, pageQuery } from './schemas';

const router = Router();
const admin = [authenticate, authorize('ADMIN', 'SUPER_ADMIN')];

// Donations are created by submitting a certificate (POST /certificates/upload) so that every
// donation is always backed by a file. Admin edits and status transitions are below.

router.get(
  '/',
  ...admin,
  validate({
    query: pageQuery.extend({
      status: z.enum(DONATION_STATUSES).optional(),
      bloodGroup: bloodGroup.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      search: z.string().trim().max(100).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const filter: Record<string, any> = { deletedAt: null };
    if (q.status) filter.status = q.status;
    if (q.bloodGroup) filter.bloodGroup = q.bloodGroup;
    if (q.from || q.to) filter.donationDate = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ location: rx }, { donor: { $in: await User.find({ $or: [{ fullName: rx }, { email: rx }] }).distinct('_id') } }];
    }
    const [items, total] = await Promise.all([
      Donation.find(filter).sort({ donationDate: -1 }).skip(skip).limit(limit)
        .populate('donor', 'fullName email')
        .populate('certificate', 'status originalName mimeType')
        .populate('verifiedBy', 'fullName')
        .lean(),
      Donation.countDocuments(filter),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

router.get(
  '/:id',
  authenticate,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const d = await Donation.findOne({ _id: req.params.id, deletedAt: null })
      .populate('donor', 'fullName email')
      .populate('certificate', 'status rejectionReason originalName mimeType reviewedAt')
      .populate('verifiedBy', 'fullName')
      .lean();
    if (!d) throw ApiError.notFound('Donation not found');
    if (req.user!.role === 'DONOR' && String((d.donor as any)._id) !== req.user!.id) throw ApiError.notFound('Donation not found');
    ok(res, d);
  }),
);

router.patch(
  '/:id',
  ...admin,
  validate({
    params: idParams,
    body: z.object({
      donationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
      location: z.string().trim().min(2).max(200).optional(),
      bloodGroup: bloodGroup.optional(),
      adminRemarks: z.string().trim().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const d = await correctDonation(req.params.id, req.body);
    await audit(req, 'DONATION_CORRECTED', 'Donation', d._id, req.body);
    ok(res, d);
  }),
);

/** PENDING -> VERIFIED/REJECTED (via the certificate workflow), VERIFIED -> REJECTED (invalidation). */
router.patch(
  '/:id/status',
  ...admin,
  validate({ params: idParams, body: z.object({ status: z.enum(['VERIFIED', 'REJECTED']), remarks: z.string().trim().max(500).optional() }) }),
  asyncHandler(async (req, res) => {
    const donation = await Donation.findOne({ _id: req.params.id, deletedAt: null });
    if (!donation) throw ApiError.notFound('Donation not found');
    const { status, remarks } = req.body as { status: 'VERIFIED' | 'REJECTED'; remarks?: string };
    let result;
    if (donation.status === 'PENDING') {
      const cert = await Certificate.findOne({ donation: donation._id, deletedAt: null });
      if (!cert) throw ApiError.conflict('Donation has no certificate to review');
      if (status === 'VERIFIED') result = await approveCertificate(String(cert._id), req.user!, remarks);
      else {
        if (!remarks || remarks.length < 5) throw ApiError.badRequest('A rejection reason is required');
        result = await rejectCertificate(String(cert._id), req.user!, remarks);
      }
    } else if (donation.status === 'VERIFIED' && status === 'REJECTED') {
      if (!remarks || remarks.length < 5) throw ApiError.badRequest('A reason is required to invalidate a verified donation');
      result = await invalidateDonation(String(donation._id), req.user!, remarks);
    } else {
      throw ApiError.conflict(`Cannot change a ${donation.status} donation to ${status}`);
    }
    await audit(req, `DONATION_${status}`, 'Donation', donation._id, { remarks });
    ok(res, result);
  }),
);

export default router;
