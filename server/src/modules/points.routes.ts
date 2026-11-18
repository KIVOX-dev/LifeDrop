import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/common';
import { DonorProfile, PointsTransaction } from '../models';
import { leaderboard, myRank, Period } from '../services/points.service';
import { asyncHandler, ok, pageMeta, paginate } from '../utils/common';
import { bloodGroup, objectId, pageQuery } from './schemas';

/* ------------------------------------ /points ------------------------------------ */
export const pointsRouter = Router();

pointsRouter.get(
  '/my-points',
  authenticate,
  asyncHandler(async (req, res) => {
    const [profile, rank] = await Promise.all([
      DonorProfile.findOne({ user: req.user!.id }).select('totalPoints totalVerifiedDonations lastDonationDate').lean(),
      myRank(req.user!.id),
    ]);
    ok(res, { totalPoints: profile?.totalPoints ?? 0, totalVerifiedDonations: profile?.totalVerifiedDonations ?? 0, lastDonationDate: profile?.lastDonationDate ?? null, rank: rank.rank, pointsPerDonation: 100 });
  }),
);

pointsRouter.get(
  '/transactions',
  authenticate,
  validate({ query: pageQuery.extend({ userId: objectId.optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    // Admins may inspect any donor; donors only ever see their own ledger.
    const user = req.user!.role !== 'DONOR' && q.userId ? q.userId : req.user!.id;
    const [items, total] = await Promise.all([
      PointsTransaction.find({ user }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('donation', 'donationDate location').lean(),
      PointsTransaction.countDocuments({ user }),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

/* --------------------------------- /leaderboard --------------------------------- */
export const leaderboardRouter = Router();

async function softAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try {
      req.user = { id: String((jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET, { issuer: 'lifedrop' }) as jwt.JwtPayload).sub), role: 'DONOR', email: '', fullName: '' };
    } catch { /* anonymous */ }
  }
  next();
}

const lbQuery = pageQuery.extend({
  bloodGroup: bloodGroup.optional(),
  city: z.string().trim().max(80).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const handler = (period: Period) =>
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const base = { period, year: q.year, month: q.month, bloodGroup: q.bloodGroup, city: q.city };
    const [list, top3, me] = await Promise.all([
      leaderboard({ ...base, page: q.page, limit: q.limit }, req.user?.id),
      leaderboard({ ...base, page: 1, limit: 3 }),
      req.user ? myRank(req.user.id, period) : null,
    ]);
    ok(res, { entries: list.entries, top3: top3.entries, me }, pageMeta(q.page, q.limit, list.total));
  });

leaderboardRouter.get('/', softAuth, validate({ query: lbQuery }), handler('overall'));
leaderboardRouter.get('/monthly', softAuth, validate({ query: lbQuery }), handler('monthly'));
leaderboardRouter.get('/yearly', softAuth, validate({ query: lbQuery }), handler('yearly'));
