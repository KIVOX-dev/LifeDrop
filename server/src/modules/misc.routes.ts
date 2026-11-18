import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { authenticate, authorize } from '../middleware/auth';
import { aiLimiter, sensitiveLimiter, validate } from '../middleware/common';
import { BloodRequirement, Donation, DonorProfile, Notification, PointsTransaction, User } from '../models';
import { aiSnapshot, analytics } from '../services/analytics.service';
import { ADMIN_SYSTEM_PROMPT, ChatMessage, DONOR_SYSTEM_PROMPT, groqChat } from '../services/ai.service';
import { applyBrevoEvent } from '../services/email.service';
import { getSettings, notifyAdmins } from '../services/common.service';
import { verifyUnsubscribeToken } from '../services/unsubscribe';
import { ApiError, asyncHandler, ok, pageMeta, paginate, safeEqual } from '../utils/common';
import { audit } from '../services/common.service';
import { DonorProfile as Profile } from '../models';
import { email, idParams, pageQuery } from './schemas';

/* ======================================= notifications ======================================= */
export const notificationsRouter = Router();

// Public, token-authenticated one-click unsubscribe from non-essential email.
notificationsRouter.get(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const userId = verifyUnsubscribeToken(String(req.query.token ?? ''));
    const page = (title: string, body: string) =>
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;background:#F8FAFC;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;max-width:440px;text-align:center"><h2 style="color:#B91C35;margin-top:0">${title}</h2><p>${body}</p></div></body>`;
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    if (!userId) return res.status(400).type('html').send(page('Invalid link', 'This unsubscribe link is invalid or has expired.'));
    await Profile.updateOne({ user: userId }, { 'preferences.nonEssentialEmails': false });
    res.type('html').send(page('You are unsubscribed', 'You will no longer receive blood requirement alerts or reminders. Account and security emails will still be sent. You can change this any time in your profile settings.'));
  }),
);

notificationsRouter.get(
  '/',
  authenticate,
  validate({ query: pageQuery.extend({ unread: z.enum(['true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    const { page, limit, skip } = paginate(q);
    const filter = { user: req.user!.id, ...(q.unread === 'true' ? { readAt: { $exists: false } } : {}) };
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user!.id, readAt: { $exists: false } }),
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), unread });
  }),
);

notificationsRouter.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const r = await Notification.updateMany({ user: req.user!.id, readAt: { $exists: false } }, { readAt: new Date() });
    ok(res, { updated: r.modifiedCount });
  }),
);

notificationsRouter.patch(
  '/:id/read',
  authenticate,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user!.id }, { readAt: new Date() }, { returnDocument: 'after' });
    if (!n) throw ApiError.notFound('Notification not found');
    ok(res, n);
  }),
);

/* ========================================== public ========================================== */
export const publicRouter = Router();

publicRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [donors, donations, points, active] = await Promise.all([
      User.countDocuments({ role: 'DONOR', isActive: true, deletedAt: null }),
      Donation.countDocuments({ status: 'VERIFIED', deletedAt: null }),
      PointsTransaction.aggregate([{ $group: { _id: null, t: { $sum: '$points' } } }]),
      BloodRequirement.countDocuments({ status: 'PUBLISHED', deletedAt: null, lastDateToRespond: { $gte: new Date() } }),
    ]);
    const s = await getSettings();
    ok(res, { donors, donations, points: points[0]?.t ?? 0, activeRequirements: active, announcement: s.announcement || null, contact: { email: s.contactEmail, phone: s.contactPhone, address: s.contactAddress }, registrationsOpen: s.registrationsOpen });
  }),
);

publicRouter.post(
  '/contact',
  sensitiveLimiter,
  validate({ body: z.object({ name: z.string().trim().min(2).max(100), email, subject: z.string().trim().min(3).max(150), message: z.string().trim().min(10).max(2000) }) }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    await notifyAdmins(`Contact form: ${b.subject}`, b.message, [['From', `${b.name} <${b.email}>`]], '/admin');
    ok(res, { message: 'Thank you! Your message has been sent to our team.' });
  }),
);

/* ========================================== webhooks ========================================== */
export const webhooksRouter = Router();

webhooksRouter.post(
  '/brevo',
  asyncHandler(async (req, res) => {
    const secret = env.BREVO_WEBHOOK_SECRET;
    if (!secret || secret.startsWith('YOUR_')) throw ApiError.unavailable('Webhook secret is not configured');
    const auth = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const provided = auth || req.get('x-webhook-secret') || String(req.query.secret ?? '');
    if (!provided || !safeEqual(provided, secret)) throw ApiError.unauthorized('Invalid webhook credentials');
    const events = Array.isArray(req.body) ? req.body : [req.body];
    let processed = 0;
    for (const e of events.slice(0, 500)) if (e && typeof e === 'object' && (await applyBrevoEvent(e))) processed++;
    ok(res, { received: events.length, processed });
  }),
);

/* ============================================= AI ============================================= */
export const aiRouter = Router();

const history = z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().max(1500) })).max(6).default([]);
const clip = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1500);

aiRouter.post(
  '/admin-assistant',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  aiLimiter,
  validate({
    body: z.object({
      mode: z.enum(['chat', 'donor_activity', 'requirement_summary', 'insights', 'requirement_description']).default('chat'),
      message: z.string().trim().max(1000).default(''),
      history,
      draft: z
        .object({ title: z.string().max(150).optional(), bloodGroup: z.string().max(5).optional(), hospitalName: z.string().max(150).optional(), city: z.string().max(80).optional(), unitsRequired: z.coerce.number().int().min(1).max(1000).optional(), urgency: z.string().max(10).optional() })
        .optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { mode, message, draft } = req.body;
    if (mode === 'chat' && message.length < 2) throw ApiError.badRequest('Please enter a question');
    const tasks: Record<string, string> = {
      chat: message,
      donor_activity: 'Summarise donor activity: registrations, donations, certificate review status and notable trends.',
      requirement_summary: 'Summarise current and recent blood requirements, urgency, coverage and notification delivery.',
      insights: 'Give 4-6 concise dashboard insights and suggested next actions for administrators.',
      requirement_description: `Write a clear, calm, factual public description (max 90 words) for this blood requirement. Do not claim medical compatibility, do not invent facts, do not include phone numbers or names. Details: ${JSON.stringify(draft ?? {})}`,
    };
    const snapshot = mode === 'requirement_description' ? null : await aiSnapshot();
    const messages: ChatMessage[] = [
      { role: 'system', content: ADMIN_SYSTEM_PROMPT },
      ...(snapshot ? [{ role: 'system' as const, content: `PLATFORM DATA (aggregated, anonymised):\n${JSON.stringify(snapshot)}` }] : []),
      ...req.body.history.map((h: any) => ({ role: h.role, content: clip(h.content) })),
      { role: 'user', content: clip(tasks[mode]) },
    ];
    const reply = await groqChat(messages, { maxTokens: mode === 'requirement_description' ? 300 : 800 });
    await audit(req, 'AI_ADMIN_QUERY', 'AI', undefined, { mode });
    ok(res, { reply, mode });
  }),
);

aiRouter.post(
  '/donor-assistant',
  authenticate,
  aiLimiter,
  validate({ body: z.object({ message: z.string().trim().min(2).max(500), history }) }),
  asyncHandler(async (req, res) => {
    const reply = await groqChat(
      [{ role: 'system', content: DONOR_SYSTEM_PROMPT }, ...req.body.history.map((h: any) => ({ role: h.role, content: clip(h.content) })), { role: 'user', content: clip(req.body.message) }],
      { maxTokens: 400, temperature: 0.2 },
    );
    ok(res, { reply });
  }),
);

aiRouter.post(
  '/report-summary',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  aiLimiter,
  validate({ body: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }),
  asyncHandler(async (req, res) => {
    let from = req.body.from as Date | undefined;
    let to = req.body.to as Date | undefined;
    if (req.body.month) {
      const [y, m] = req.body.month.split('-').map(Number);
      from = new Date(Date.UTC(y, m - 1, 1));
      to = new Date(Date.UTC(y, m, 1) - 1);
    }
    const [snapshot, period] = await Promise.all([aiSnapshot({ from, to }), analytics({ from, to })]);
    const reply = await groqChat(
      [
        { role: 'system', content: ADMIN_SYSTEM_PROMPT },
        { role: 'system', content: `PLATFORM DATA (aggregated, anonymised):\n${JSON.stringify({ allTime: snapshot, selectedPeriod: period })}` },
        { role: 'user', content: `Write a concise report${req.body.month ? ` for ${req.body.month}` : ' for the selected period'} with headings: Overview, Donations & certificates, Requirements, Email delivery, Recommendations. Use only the data provided.` },
      ],
      { maxTokens: 1000 },
    );
    await audit(req, 'AI_REPORT_GENERATED', 'AI', undefined, { month: req.body.month });
    ok(res, { report: reply, range: { from: from ?? null, to: to ?? null } });
  }),
);

void DonorProfile;
