import { PipelineStage, Types } from 'mongoose';
import { DateTime } from 'luxon';
import { env } from '../config/env';
import { Donation, DonorProfile, PointsTransaction } from '../models';
import { POINTS_PER_DONATION } from '../utils/common';

/**
 * Idempotent award. The unique index on (donation, type) guarantees at most one award per donation,
 * even under concurrent approvals; the profile counter is only incremented by the request that
 * actually inserted the transaction.
 */
export async function awardPoints(donation: { _id: Types.ObjectId; donor: Types.ObjectId; donationDate: Date }, awardedBy?: string) {
  try {
    await PointsTransaction.create({
      user: donation.donor,
      donation: donation._id,
      type: 'DONATION_APPROVED',
      points: POINTS_PER_DONATION,
      note: 'Verified donation certificate',
      awardedBy,
    });
  } catch (err: any) {
    if (err?.code === 11000) return false; // already awarded
    throw err;
  }
  await DonorProfile.updateOne(
    { user: donation.donor },
    { $inc: { totalPoints: POINTS_PER_DONATION, totalVerifiedDonations: 1 }, $max: { lastDonationDate: donation.donationDate } },
  );
  return true;
}

/** Reverse an award when an approved donation is later invalidated. */
export async function reversePoints(donation: { _id: Types.ObjectId; donor: Types.ObjectId }, by?: string) {
  const award = await PointsTransaction.findOne({ donation: donation._id, type: 'DONATION_APPROVED' });
  if (!award) return false;
  try {
    await PointsTransaction.create({
      user: donation.donor,
      donation: donation._id,
      type: 'DONATION_REVERSED',
      points: -award.points,
      note: 'Donation invalidated by administrator',
      awardedBy: by,
    });
  } catch (err: any) {
    if (err?.code === 11000) return false;
    throw err;
  }
  await DonorProfile.updateOne({ user: donation.donor }, { $inc: { totalPoints: -award.points, totalVerifiedDonations: -1 } });
  const last = await Donation.findOne({ donor: donation.donor, status: 'VERIFIED' }).sort({ donationDate: -1 }).select('donationDate').lean();
  await DonorProfile.updateOne({ user: donation.donor }, last ? { lastDonationDate: last.donationDate } : { $unset: { lastDonationDate: 1 } });
  return true;
}

/** Safety net: award points for VERIFIED donations whose award was interrupted (crash between steps). */
export async function reconcilePoints() {
  const verified = await Donation.find({ status: 'VERIFIED', deletedAt: null }).select('_id donor donationDate').lean();
  if (!verified.length) return 0;
  const awarded = new Set(
    (await PointsTransaction.find({ type: 'DONATION_APPROVED', donation: { $in: verified.map((d) => d._id) } }).select('donation').lean()).map((t) => String(t.donation)),
  );
  let n = 0;
  for (const d of verified) if (!awarded.has(String(d._id)) && (await awardPoints(d as any))) n++;
  return n;
}

/* --------------------------------- leaderboard --------------------------------- */
export type Period = 'overall' | 'monthly' | 'yearly';

export function periodRange(period: Period, year?: number, month?: number) {
  if (period === 'overall') return null;
  const now = DateTime.now().setZone(env.APP_TIMEZONE);
  const y = year ?? now.year;
  const start = period === 'yearly' ? DateTime.fromObject({ year: y }, { zone: env.APP_TIMEZONE }) : DateTime.fromObject({ year: y, month: month ?? now.month }, { zone: env.APP_TIMEZONE });
  return { from: start.toJSDate(), to: start.plus(period === 'yearly' ? { years: 1 } : { months: 1 }).toJSDate() };
}

interface LbOpts { period: Period; year?: number; month?: number; bloodGroup?: string; city?: string; page: number; limit: number }

const baseStages = (o: LbOpts): PipelineStage[] => {
  const range = periodRange(o.period, o.year, o.month);
  const stages: PipelineStage[] = [
    { $match: { ...(range ? { createdAt: { $gte: range.from, $lt: range.to } } : {}) } },
    {
      $group: {
        _id: '$user',
        points: { $sum: '$points' },
        donations: { $sum: { $cond: [{ $eq: ['$type', 'DONATION_APPROVED'] }, 1, { $cond: [{ $eq: ['$type', 'DONATION_REVERSED'] }, -1, 0] }] } },
        lastAt: { $max: '$createdAt' },
      },
    },
    { $match: { points: { $gt: 0 } } },
    { $lookup: { from: 'donorprofiles', localField: '_id', foreignField: 'user', as: 'profile' } },
    { $unwind: '$profile' },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    { $match: { 'u.isActive': true, 'u.deletedAt': null } },
  ];
  if (o.bloodGroup) stages.push({ $match: { 'profile.bloodGroup': o.bloodGroup } });
  if (o.city) stages.push({ $match: { 'profile.city': { $regex: `^${o.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } } });
  return stages;
};

/** Public leaderboard. Donors who hid their profile appear as "Anonymous donor" (rank is preserved). */
export async function leaderboard(o: LbOpts, viewerId?: string) {
  const stages = baseStages(o);
  const [rows, count] = await Promise.all([
    PointsTransaction.aggregate([
      ...stages,
      { $sort: { points: -1, donations: -1, lastAt: 1, _id: 1 } },
      { $skip: (o.page - 1) * o.limit },
      { $limit: o.limit },
    ]),
    PointsTransaction.aggregate([...stages, { $count: 'n' }]),
  ]);
  const total = count[0]?.n ?? 0;
  const entries = rows.map((r, i) => {
    const visible = r.profile.privacy?.showOnLeaderboard !== false;
    return {
      rank: (o.page - 1) * o.limit + i + 1,
      name: visible ? r.u.fullName : 'Anonymous donor',
      bloodGroup: visible ? r.profile.bloodGroup : null,
      city: visible ? r.profile.city : null,
      points: r.points,
      donations: r.donations,
      isMe: viewerId ? String(r._id) === viewerId : false,
    };
  });
  return { entries, total };
}

export async function myRank(userId: string, period: Period = 'overall') {
  const stages = baseStages({ period, page: 1, limit: 1 });
  const me = await PointsTransaction.aggregate([...stages, { $match: { _id: new Types.ObjectId(userId) } }]);
  if (!me.length) return { rank: null as number | null, points: 0, donations: 0 };
  const ahead = await PointsTransaction.aggregate([...stages, { $match: { $or: [{ points: { $gt: me[0].points } }, { points: me[0].points, donations: { $gt: me[0].donations } }] } }, { $count: 'n' }]);
  return { rank: (ahead[0]?.n ?? 0) + 1, points: me[0].points as number, donations: me[0].donations as number };
}
