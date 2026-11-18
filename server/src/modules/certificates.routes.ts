import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { uploadLimiter, validate } from '../middleware/common';
import { uploadSingle } from '../middleware/upload';
import { Certificate } from '../models';
import { CERT_STATUSES } from '../models/Certificate';
import { audit } from '../services/common.service';
import { approveCertificate, deleteCertificate, rejectCertificate, submitCertificate } from '../services/donation.service';
import { storage } from '../services/storage.service';
import { ApiError, asyncHandler, created, escapeRegex, ok, pageMeta, paginate } from '../utils/common';
import { bloodGroup, idParams, pageQuery } from './schemas';
import { User } from '../models';

const router = Router();

/** Storage keys and file hashes are internal; they are never sent to clients. */
const publicCertificate = (c: any) => {
  const o = typeof c.toObject === 'function' ? c.toObject() : { ...c };
  delete o.storageKey;
  delete o.fileHash;
  return o;
};
const admin = [authenticate, authorize('ADMIN', 'SUPER_ADMIN')];
const donor = [authenticate, authorize('DONOR')];

router.post(
  '/upload',
  ...donor,
  uploadLimiter,
  ...uploadSingle('certificate'),
  validate({
    body: z.object({
      donationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD'),
      location: z.string().trim().min(2).max(200),
      bloodGroup: bloodGroup.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { donation, certificate } = await submitCertificate(req.user!.id, req.validatedFile!, req.body);
    created(res, { donation, certificate: publicCertificate(certificate) });
  }),
);

router.get(
  '/my-certificates',
  ...donor,
  validate({ query: pageQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = paginate(req.query as any);
    const filter = { donor: req.user!.id, deletedAt: null };
    const [items, total] = await Promise.all([
      Certificate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-storageKey -fileHash').populate('donation', 'donationDate location bloodGroup status').lean(),
      Certificate.countDocuments(filter),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

router.get(
  '/',
  ...admin,
  validate({ query: pageQuery.extend({ status: z.enum(CERT_STATUSES).optional(), search: z.string().trim().max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.donor = { $in: await User.find({ $or: [{ fullName: rx }, { email: rx }] }).distinct('_id') };
    }
    const [items, total] = await Promise.all([
      Certificate.find(filter).sort({ status: 1, createdAt: q.status === 'PENDING' || !q.status ? 1 : -1 }).skip(skip).limit(limit)
        .select('-storageKey -fileHash')
        .populate('donor', 'fullName email')
        .populate('donation', 'donationDate location bloodGroup status')
        .populate('reviewedBy', 'fullName')
        .lean(),
      Certificate.countDocuments(filter),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

async function loadAuthorized(id: string, user: { id: string; role: string }) {
  const cert = await Certificate.findOne({ _id: id, deletedAt: null })
    .populate('donor', 'fullName email')
    .populate('donation')
    .populate('reviewedBy', 'fullName');
  if (!cert) throw ApiError.notFound('Certificate not found');
  const ownerId = String((cert.donor as any)._id ?? cert.donor);
  if (user.role === 'DONOR' && ownerId !== user.id) throw ApiError.notFound('Certificate not found'); // no existence leak
  return cert;
}

router.get(
  '/:id',
  authenticate,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const cert = await loadAuthorized(req.params.id, req.user!);
    ok(res, publicCertificate(cert));
  }),
);

router.post(
  '/:id/approve',
  ...admin,
  validate({ params: idParams, body: z.object({ remarks: z.string().trim().max(500).optional() }) }),
  asyncHandler(async (req, res) => {
    const r = await approveCertificate(req.params.id, req.user!, req.body.remarks);
    await audit(req, 'CERTIFICATE_APPROVED', 'Certificate', req.params.id, { donation: r.donation._id });
    ok(res, { donation: r.donation, certificate: publicCertificate(r.certificate) });
  }),
);

router.post(
  '/:id/reject',
  ...admin,
  validate({ params: idParams, body: z.object({ reason: z.string().trim().min(5, 'Please give a reason (min 5 characters)').max(500) }) }),
  asyncHandler(async (req, res) => {
    const r = await rejectCertificate(req.params.id, req.user!, req.body.reason);
    await audit(req, 'CERTIFICATE_REJECTED', 'Certificate', req.params.id, { reason: req.body.reason });
    ok(res, { donation: r.donation, certificate: publicCertificate(r.certificate) });
  }),
);

/** Short-lived signed URL; the bucket stays private. `?inline=1` returns a preview-friendly URL. */
router.get(
  '/:id/download',
  authenticate,
  validate({ params: idParams, query: z.object({ inline: z.enum(['0', '1', 'true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    const cert = await loadAuthorized(req.params.id, req.user!);
    const inline = ['1', 'true'].includes((req.query as any).inline);
    const signed = await storage.signedUrl(cert.storageKey, { filename: cert.originalName, inline, expiresIn: 300 });
    if (req.user!.role !== 'DONOR') await audit(req, 'CERTIFICATE_VIEWED', 'Certificate', cert._id);
    ok(res, { ...signed, mimeType: cert.mimeType, filename: cert.originalName });
  }),
);

router.delete(
  '/:id',
  authenticate,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await deleteCertificate(req.params.id, req.user!);
    if (req.user!.role !== 'DONOR') await audit(req, 'CERTIFICATE_DELETED', 'Certificate', req.params.id);
    ok(res, { message: 'Certificate deleted' });
  }),
);

export default router;
