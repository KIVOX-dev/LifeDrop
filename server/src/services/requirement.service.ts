import { Types } from 'mongoose';
import { BloodRequirement, DonorProfile, Notification, RequirementNotification, User } from '../models';
import { ApiError } from '../utils/common';
import { logger } from '../utils/logger';
import { clientUrl } from './common.service';
import { queueEmail } from './email.service';
import { unsubscribeUrl } from './unsubscribe';

const BATCH = 500;

/**
 * Eligible = active, verified, non-deleted account + available + opted in to requirement alerts
 * (and non-essential email) + matching blood group (unless the requirement targets ALL).
 * NOTE: blood group matching is a notification filter only - it is NOT a medical compatibility decision.
 */
function profileFilter(bloodGroup: string): Record<string, unknown> {
  return {
    isAvailable: true,
    'preferences.nonEssentialEmails': { $ne: false },
    'preferences.requirementAlerts': { $ne: false },
    ...(bloodGroup === 'ALL' ? {} : { bloodGroup }),
  };
}

async function* eligibleDonors(bloodGroup: string) {
  const cursor = DonorProfile.find(profileFilter(bloodGroup) as any).select('user').lean().cursor({ batchSize: BATCH });
  let ids: Types.ObjectId[] = [];
  const flush = async () => {
    const users = await User.find({ _id: { $in: ids }, role: 'DONOR', isActive: true, emailVerified: true, deletedAt: null }).select('email fullName').lean();
    ids = [];
    return users;
  };
  for await (const p of cursor) {
    ids.push((p as any).user as Types.ObjectId);
    if (ids.length >= BATCH) yield await flush();
  }
  if (ids.length) yield await flush();
}

export async function countEligible(bloodGroup: string) {
  let n = 0;
  for await (const batch of eligibleDonors(bloodGroup)) n += batch.length;
  return n;
}

/** Idempotent: safe to call repeatedly; (requirement, donor) uniqueness prevents duplicates. */
export async function dispatchRequirement(requirementId: string) {
  const reqDoc = await BloodRequirement.findOne({ _id: requirementId, status: 'PUBLISHED', deletedAt: null });
  if (!reqDoc) throw ApiError.conflict('Requirement is not published');
  const r = reqDoc.toObject();
  let newlyQueued = 0;

  for await (const donors of eligibleDonors(r.bloodGroup)) {
    await RequirementNotification.bulkWrite(
      donors.map((d) => ({
        updateOne: { filter: { requirement: r._id, donor: d._id }, update: { $setOnInsert: { status: 'QUEUED' } }, upsert: true },
      })),
      { ordered: false },
    );
    const rows = await RequirementNotification.find({ requirement: r._id, donor: { $in: donors.map((d) => d._id) }, emailLog: { $exists: false } }).lean();
    const byId = new Map(donors.map((d) => [String(d._id), d]));
    const fresh: Types.ObjectId[] = [];
    for (const row of rows) {
      const donor = byId.get(String(row.donor));
      if (!donor) continue;
      try {
        const log = await queueEmail({
          to: donor.email,
          toName: donor.fullName,
          userId: donor._id,
          template: 'BLOOD_REQUIREMENT',
          category: 'NON_ESSENTIAL',
          requirementId: r._id,
          dedupeKey: `req:${r._id}:${donor._id}`,
          data: {
            name: donor.fullName,
            url: clientUrl('/dashboard/requirements'),
            unsubscribeUrl: unsubscribeUrl(String(donor._id)),
            requirement: {
              title: r.title,
              bloodGroup: r.bloodGroup,
              hospitalName: r.hospitalName,
              address: r.address,
              city: r.city,
              state: r.state,
              country: r.country,
              unitsRequired: r.unitsRequired,
              contactPerson: r.contactPerson,
              contactPhone: r.contactPhone,
              contactEmail: r.contactEmail,
              description: r.description,
              urgency: r.urgency,
              lastDateToRespond: r.lastDateToRespond,
            },
          },
        });
        if (log) {
          await RequirementNotification.updateOne({ _id: row._id }, { emailLog: log._id, status: log.status === 'SKIPPED' ? 'SKIPPED' : 'QUEUED' });
          fresh.push(donor._id);
          newlyQueued++;
        }
      } catch (err: any) {
        logger.error({ err: err.message, donor: String(donor._id) }, 'requirement email enqueue failed');
        await RequirementNotification.updateOne({ _id: row._id }, { status: 'FAILED', error: String(err.message).slice(0, 300) });
      }
    }
    if (fresh.length) {
      await Notification.insertMany(
        fresh.map((u) => ({
          user: u,
          type: 'NEW_REQUIREMENT',
          title: `Blood needed: ${r.bloodGroup === 'ALL' ? 'all groups' : r.bloodGroup}`,
          message: `${r.hospitalName}, ${r.city} - ${r.unitsRequired} unit(s). Respond by ${r.lastDateToRespond.toISOString().slice(0, 10)}.`,
          link: '/dashboard/requirements',
        })),
        { ordered: false },
      );
    }
  }
  return { newlyQueued };
}

export async function publishRequirement(id: string) {
  const r = await BloodRequirement.findOne({ _id: id, deletedAt: null });
  if (!r) throw ApiError.notFound('Requirement not found');
  if (r.status === 'CLOSED') throw ApiError.conflict('A closed requirement cannot be published again');
  if (r.lastDateToRespond.getTime() < Date.now()) throw ApiError.badRequest('The response deadline has already passed');
  // Atomic DRAFT -> PUBLISHED so concurrent publish clicks dispatch only once.
  const claimed = await BloodRequirement.findOneAndUpdate({ _id: id, status: 'DRAFT' }, { status: 'PUBLISHED', publishedAt: new Date() }, { returnDocument: 'after' });
  if (!claimed) throw ApiError.conflict('This requirement is already published');
  const { newlyQueued } = await dispatchRequirement(id);
  return { requirement: claimed, newlyQueued };
}

export async function requirementStats(id: string) {
  const r = await BloodRequirement.findOne({ _id: id, deletedAt: null }).lean();
  if (!r) throw ApiError.notFound('Requirement not found');
  const rows = await RequirementNotification.aggregate([{ $match: { requirement: new Types.ObjectId(id) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const c = Object.fromEntries(rows.map((x) => [x._id, x.n as number])) as Record<string, number>;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const estimatedTargets = r.status === 'DRAFT' ? await countEligible(r.bloodGroup) : undefined;
  return {
    targetDonors: r.status === 'DRAFT' ? estimatedTargets : total,
    queued: c.QUEUED ?? 0,
    sent: c.SENT ?? 0,
    delivered: c.DELIVERED ?? 0,
    failed: c.FAILED ?? 0,
    skipped: c.SKIPPED ?? 0,
    pending: c.QUEUED ?? 0,
    estimated: r.status === 'DRAFT',
  };
}
