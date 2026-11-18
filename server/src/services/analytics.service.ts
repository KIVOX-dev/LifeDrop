import { env } from '../config/env';
import { BloodRequirement, Certificate, Donation, DonorProfile, EmailLog, PointsTransaction, Reminder, RequirementNotification, User } from '../models';

export interface Range { from?: Date; to?: Date }
const dateMatch = (field: string, r: Range) =>
  r.from || r.to ? { [field]: { ...(r.from ? { $gte: r.from } : {}), ...(r.to ? { $lte: r.to } : {}) } } : {};
const monthFmt = (field: string) => ({ $dateToString: { format: '%Y-%m', date: field, timezone: env.APP_TIMEZONE } });
const toMap = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id ?? 'UNKNOWN', r.n]));

export async function dashboardStats() {
  const live = { deletedAt: null };
  const [totalDonors, activeDonors, verified, pendingCerts, rejectedCerts, activeReqs, points, emails, pendingReminders, deletionRequests] = await Promise.all([
    User.countDocuments({ role: 'DONOR', ...live }),
    User.countDocuments({ role: 'DONOR', isActive: true, ...live }),
    Donation.countDocuments({ status: 'VERIFIED', ...live }),
    Certificate.countDocuments({ status: 'PENDING', ...live }),
    Certificate.countDocuments({ status: 'REJECTED', ...live }),
    BloodRequirement.countDocuments({ status: 'PUBLISHED', lastDateToRespond: { $gte: new Date() }, ...live }),
    PointsTransaction.aggregate([{ $group: { _id: null, total: { $sum: '$points' } } }]),
    EmailLog.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Reminder.countDocuments({ status: 'SCHEDULED' }),
    User.countDocuments({ role: 'DONOR', deletionRequestedAt: { $exists: true }, ...live }),
  ]);
  const e = toMap(emails as any);
  return {
    totalDonors,
    activeDonors,
    verifiedDonations: verified,
    pendingCertificates: pendingCerts,
    rejectedCertificates: rejectedCerts,
    activeRequirements: activeReqs,
    totalPointsAwarded: points[0]?.total ?? 0,
    pendingReminders,
    deletionRequests,
    emails: {
      total: Object.values(e).reduce((a: number, b) => a + (b as number), 0),
      queued: (e.QUEUED ?? 0) + (e.RETRYING ?? 0),
      sent: e.SENT ?? 0,
      delivered: e.DELIVERED ?? 0,
      failed: (e.FAILED ?? 0) + (e.BOUNCED ?? 0),
      skipped: e.SKIPPED ?? 0,
    },
  };
}

export async function analytics(r: Range) {
  const [registrations, donations, groups, geoState, geoCity, certs, lbStats, reqStatus, reqGroup, reqUrgency, emailStatus, emailTemplate] = await Promise.all([
    User.aggregate([{ $match: { role: 'DONOR', deletedAt: null, ...dateMatch('createdAt', r) } }, { $group: { _id: monthFmt('$createdAt'), n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Donation.aggregate([{ $match: { status: 'VERIFIED', deletedAt: null, ...dateMatch('donationDate', r) } }, { $group: { _id: monthFmt('$donationDate'), n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    DonorProfile.aggregate([{ $group: { _id: '$bloodGroup', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    DonorProfile.aggregate([{ $group: { _id: { $concat: ['$state', ', ', '$country'] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }]),
    DonorProfile.aggregate([{ $group: { _id: '$city', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }]),
    Certificate.aggregate([{ $match: { deletedAt: null, ...dateMatch('createdAt', r) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    DonorProfile.aggregate([
      { $group: { _id: null, donorsWithPoints: { $sum: { $cond: [{ $gt: ['$totalPoints', 0] }, 1, 0] } }, avgPoints: { $avg: '$totalPoints' }, maxPoints: { $max: '$totalPoints' }, totalPoints: { $sum: '$totalPoints' } } },
    ]),
    BloodRequirement.aggregate([{ $match: { deletedAt: null, ...dateMatch('createdAt', r) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    BloodRequirement.aggregate([{ $match: { deletedAt: null, ...dateMatch('createdAt', r) } }, { $group: { _id: '$bloodGroup', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    BloodRequirement.aggregate([{ $match: { deletedAt: null, ...dateMatch('createdAt', r) } }, { $group: { _id: '$urgency', n: { $sum: 1 } } }]),
    EmailLog.aggregate([{ $match: dateMatch('createdAt', r) }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    EmailLog.aggregate([{ $match: dateMatch('createdAt', r) }, { $group: { _id: '$template', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
  ]);
  const c = toMap(certs as any) as Record<string, number>;
  const decided = (c.APPROVED ?? 0) + (c.REJECTED ?? 0);
  const rows = (x: any[]) => x.map((i) => ({ name: i._id ?? 'Unknown', value: i.n as number }));
  const reqNotif = await RequirementNotification.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  return {
    range: { from: r.from ?? null, to: r.to ?? null },
    registrationsByMonth: registrations.map((x: any) => ({ month: x._id, count: x.n })),
    donationsByMonth: donations.map((x: any) => ({ month: x._id, count: x.n })),
    bloodGroupDistribution: rows(groups as any),
    geographicDistribution: { states: rows(geoState as any), cities: rows(geoCity as any) },
    certificates: { pending: c.PENDING ?? 0, approved: c.APPROVED ?? 0, rejected: c.REJECTED ?? 0, approvalRate: decided ? Math.round(((c.APPROVED ?? 0) / decided) * 100) : null },
    leaderboard: lbStats[0] ? { donorsWithPoints: lbStats[0].donorsWithPoints, averagePoints: Math.round(lbStats[0].avgPoints ?? 0), topPoints: lbStats[0].maxPoints, totalPoints: lbStats[0].totalPoints } : { donorsWithPoints: 0, averagePoints: 0, topPoints: 0, totalPoints: 0 },
    requirements: { byStatus: rows(reqStatus as any), byBloodGroup: rows(reqGroup as any), byUrgency: rows(reqUrgency as any), notifications: rows(reqNotif as any) },
    emails: { byStatus: rows(emailStatus as any), byTemplate: rows(emailTemplate as any) },
  };
}

/** Aggregated, anonymised snapshot that is safe to send to an LLM (no names, emails or phones). */
export async function aiSnapshot(r: Range = {}) {
  const [stats, a] = await Promise.all([dashboardStats(), analytics(r)]);
  const recentReqs = await BloodRequirement.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(8).select('title bloodGroup city urgency status unitsRequired lastDateToRespond').lean();
  return {
    generatedAt: new Date().toISOString(),
    timezone: env.APP_TIMEZONE,
    totals: stats,
    registrationsByMonth: a.registrationsByMonth.slice(-12),
    donationsByMonth: a.donationsByMonth.slice(-12),
    bloodGroupDistribution: a.bloodGroupDistribution,
    topCities: a.geographicDistribution.cities.slice(0, 8),
    certificates: a.certificates,
    leaderboardStats: a.leaderboard,
    requirements: a.requirements,
    emails: a.emails.byStatus,
    recentRequirements: recentReqs.map((q) => ({ title: q.title, bloodGroup: q.bloodGroup, city: q.city, urgency: q.urgency, status: q.status, units: q.unitsRequired, deadline: q.lastDateToRespond })),
  };
}
