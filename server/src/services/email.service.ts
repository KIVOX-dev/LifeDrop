import { Types } from 'mongoose';
import { env } from '../config/env';
import { DonorProfile, EmailLog, RequirementNotification } from '../models';
import { EmailTemplate } from '../models/EmailLog';
import { logger } from '../utils/logger';
import { renderTemplate } from './email.templates';
import { enqueueEmailJob } from './queue';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export class PermanentEmailError extends Error {}

export interface QueueEmailInput {
  to: string;
  toName?: string;
  template: EmailTemplate;
  data: Record<string, unknown>;
  userId?: Types.ObjectId | string;
  category?: 'ESSENTIAL' | 'NON_ESSENTIAL';
  requirementId?: Types.ObjectId | string;
  /** Unique key: a second call with the same key returns the existing log without sending again. */
  dedupeKey?: string;
}

/** True when the donor has not opted out of this class of non-essential email. */
export async function canSendNonEssential(userId: Types.ObjectId | string, kind: 'requirementAlerts' | 'reminderEmails') {
  const profile = await DonorProfile.findOne({ user: userId }).select('preferences').lean();
  if (!profile) return false;
  return profile.preferences?.nonEssentialEmails !== false && profile.preferences?.[kind] !== false;
}

const kindFor = (t: EmailTemplate) => (t === 'DONATION_FOLLOWUP' ? 'reminderEmails' : 'requirementAlerts');

/** Create an EmailLog and push it onto the persistent queue. Never throws because of queue outages. */
export async function queueEmail(input: QueueEmailInput) {
  const category = input.category ?? 'ESSENTIAL';
  if (input.dedupeKey) {
    const existing = await EmailLog.findOne({ dedupeKey: input.dedupeKey });
    if (existing) return existing;
  }
  let skip = false;
  if (category === 'NON_ESSENTIAL') {
    skip = !input.userId || !(await canSendNonEssential(input.userId, kindFor(input.template)));
  }
  let log;
  try {
    log = await EmailLog.create({
      to: input.to,
      toName: input.toName,
      user: input.userId,
      template: input.template,
      category,
      data: input.data,
      requirement: input.requirementId,
      dedupeKey: input.dedupeKey,
      status: skip ? 'SKIPPED' : 'QUEUED',
      lastError: skip ? 'Recipient opted out of this email type' : undefined,
    });
  } catch (err: any) {
    if (err?.code === 11000 && input.dedupeKey) return EmailLog.findOne({ dedupeKey: input.dedupeKey });
    throw err;
  }
  if (!skip) {
    try {
      await enqueueEmailJob(String(log._id));
    } catch (err: any) {
      // The maintenance sweep re-queues stale QUEUED logs.
      logger.error({ err: err.message, logId: String(log._id) }, 'failed to enqueue email; sweep will retry');
    }
  }
  return log;
}

const RANK: Record<string, number> = { QUEUED: 0, RETRYING: 0, SENT: 1, DELIVERED: 2, FAILED: 3, BOUNCED: 3, SKIPPED: 3 };
const REQ_MAP: Record<string, string> = { QUEUED: 'QUEUED', RETRYING: 'QUEUED', SENT: 'SENT', DELIVERED: 'DELIVERED', FAILED: 'FAILED', BOUNCED: 'FAILED', SKIPPED: 'SKIPPED' };

/** Move an EmailLog forward and mirror the result onto its RequirementNotification. */
export async function setEmailStatus(logId: Types.ObjectId | string, status: string, extra: Record<string, unknown> = {}) {
  const log = await EmailLog.findById(logId);
  if (!log) return null;
  const current = RANK[log.status as string] ?? 0;
  // Never move a log backwards (e.g. webhook "delivered" arriving before the worker records "sent").
  if (RANK[status] < current && !(status === 'RETRYING' && log.status === 'QUEUED')) return log;
  log.set({ status, ...extra });
  await log.save();
  await RequirementNotification.updateOne(
    { emailLog: log._id },
    { status: REQ_MAP[status], ...(extra.lastError ? { error: String(extra.lastError).slice(0, 500) } : {}) },
  );
  return log;
}

async function sendViaBrevo(opts: { to: string; toName?: string; subject: string; html: string; text: string; tag: string }) {
  if (!env.integrations.brevo) {
    if (env.isProd) throw new PermanentEmailError('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)');
    // Development convenience only: surface the email in server logs instead of calling Brevo.
    logger.warn({ to: opts.to, subject: opts.subject, text: opts.text }, '[DEV] Brevo not configured - email logged instead of sent');
    return { messageId: `dev-${Date.now()}` };
  }
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
      to: [{ email: opts.to, ...(opts.toName ? { name: opts.toName } : {}) }],
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
      tags: [opts.tag],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    const msg = `Brevo responded ${res.status}: ${body}`;
    // 4xx (except 429/408) will not succeed on retry.
    if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) throw new PermanentEmailError(msg);
    throw new Error(msg);
  }
  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { messageId: json.messageId ?? '' };
}

/**
 * Worker entry point. Idempotent: logs already sent/delivered are ignored.
 * Throws on retryable failures; `isFinalAttempt` marks the log FAILED instead of RETRYING.
 */
export async function processEmailLog(logId: string, isFinalAttempt: boolean) {
  const log = await EmailLog.findById(logId).select('+data');
  if (!log) return 'missing';
  if (['SENT', 'DELIVERED', 'SKIPPED', 'BOUNCED'].includes(log.status as string)) return 'already-processed';

  // Re-check opt-out at send time: the donor may have unsubscribed after queueing.
  if (log.category === 'NON_ESSENTIAL') {
    if (!log.user || !(await canSendNonEssential(log.user, kindFor(log.template as EmailTemplate)))) {
      await setEmailStatus(log._id, 'SKIPPED', { lastError: 'Recipient opted out of this email type' });
      return 'skipped';
    }
  }

  try {
    const rendered = renderTemplate(log.template as EmailTemplate, (log.data as Record<string, unknown>) ?? {});
    const { messageId } = await sendViaBrevo({
      to: log.to,
      toName: log.toName ?? undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tag: String(log.template),
    });
    const scrub = ['EMAIL_VERIFICATION', 'PASSWORD_RESET'].includes(log.template as string);
    await setEmailStatus(log._id, 'SENT', {
      subject: rendered.subject,
      providerMessageId: messageId,
      sentAt: new Date(),
      attempts: (log.attempts ?? 0) + 1,
      lastError: undefined,
      ...(scrub ? { data: undefined } : {}),
    });
    return 'sent';
  } catch (err: any) {
    const permanent = err instanceof PermanentEmailError;
    await setEmailStatus(log._id, permanent || isFinalAttempt ? 'FAILED' : 'RETRYING', {
      attempts: (log.attempts ?? 0) + 1,
      lastError: String(err.message).slice(0, 500),
    });
    throw err;
  }
}

/** Map a Brevo transactional webhook event onto our log. */
export async function applyBrevoEvent(evt: { event?: string; 'message-id'?: string; messageId?: string; reason?: string }) {
  const messageId = evt['message-id'] ?? evt.messageId;
  if (!messageId || !evt.event) return false;
  const log = await EmailLog.findOne({ providerMessageId: messageId });
  if (!log) return false;
  switch (evt.event) {
    case 'delivered':
      await setEmailStatus(log._id, 'DELIVERED', { deliveredAt: new Date() });
      break;
    case 'hard_bounce':
    case 'soft_bounce':
    case 'blocked':
    case 'invalid':
    case 'invalid_email':
    case 'error':
    case 'deferred':
      if (evt.event === 'deferred') return true; // transient; Brevo keeps retrying
      await setEmailStatus(log._id, 'BOUNCED', { lastError: `${evt.event}${evt.reason ? `: ${evt.reason}` : ''}` });
      break;
    case 'spam':
    case 'unsubscribed':
      // Honour complaints / unsubscribes for non-essential mail.
      if (log.user) {
        await DonorProfile.updateOne({ user: log.user }, { 'preferences.nonEssentialEmails': false });
      }
      break;
    default:
      return true;
  }
  return true;
}

/** Re-queue logs that never made it onto the queue (Redis outage / restart). */
export async function requeueStaleEmails(olderThanMs = 10 * 60_000) {
  const stale = await EmailLog.find({
    status: { $in: ['QUEUED', 'RETRYING'] },
    updatedAt: { $lt: new Date(Date.now() - olderThanMs) },
  }).select('_id').limit(500);
  for (const l of stale) {
    await enqueueEmailJob(String(l._id)).catch((e) => logger.error({ err: e.message }, 'requeue failed'));
  }
  return stale.length;
}
