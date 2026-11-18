import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DonorProfile, EmailLog } from '../src/models';
import { EMAIL_TEMPLATES } from '../src/models/EmailLog';
import { enqueueEmailJob } from '../src/services/queue';
import { PermanentEmailError, processEmailLog, queueEmail, requeueStaleEmails, setEmailStatus } from '../src/services/email.service';
import { renderTemplate } from '../src/services/email.templates';
import { api, P, registerDonor, resetDb, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

const mockFetch = (status: number, body: unknown = { messageId: '<abc@brevo>' }) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const newLog = (over: Record<string, unknown> = {}) =>
  queueEmail({ to: 'a@example.com', toName: 'Asha', template: 'WELCOME', data: { name: 'Asha', dashboardUrl: 'https://x' }, ...over } as any);

describe('Brevo delivery (mocked)', () => {
  it('sends through the Brevo API with the api-key header and records the message id', async () => {
    const f = mockFetch(201);
    const log = await newLog();
    expect(enqueueEmailJob).toHaveBeenCalledWith(String(log!._id));
    expect(await processEmailLog(String(log!._id), false)).toBe('sent');

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as any)['api-key']).toBe('xkeysib-test');
    const payload = JSON.parse(init.body as string);
    expect(payload.to).toEqual([{ email: 'a@example.com', name: 'Asha' }]);
    expect(payload.sender.email).toBe('noreply@lifedrop.test');
    expect(payload.htmlContent).toContain('Welcome, Asha');
    expect(payload.textContent).toBeTruthy();

    const saved = await EmailLog.findById(log!._id);
    expect(saved).toMatchObject({ status: 'SENT', providerMessageId: '<abc@brevo>' });
    expect(saved!.attempts).toBe(1);
  });

  it('is idempotent: an already-sent log is never sent twice', async () => {
    const f = mockFetch(201);
    const log = await newLog();
    await processEmailLog(String(log!._id), false);
    expect(await processEmailLog(String(log!._id), false)).toBe('already-processed');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures (5xx/429) and only marks FAILED on the final attempt', async () => {
    mockFetch(503, { message: 'unavailable' });
    const log = await newLog();
    await expect(processEmailLog(String(log!._id), false)).rejects.toThrow(/503/);
    expect((await EmailLog.findById(log!._id))).toMatchObject({ status: 'RETRYING', attempts: 1 });
    await expect(processEmailLog(String(log!._id), true)).rejects.toThrow();
    expect((await EmailLog.findById(log!._id))).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect((await EmailLog.findById(log!._id))!.lastError).toMatch(/503/);
  });

  it('treats 4xx (bad key / bad request) as permanent and 429 as retryable', async () => {
    mockFetch(401, { message: 'Key not found' });
    const a = await newLog();
    await expect(processEmailLog(String(a!._id), false)).rejects.toBeInstanceOf(PermanentEmailError);
    expect((await EmailLog.findById(a!._id))!.status).toBe('FAILED');

    vi.restoreAllMocks();
    mockFetch(429, {});
    const b = await newLog({ to: 'b@example.com' });
    await expect(processEmailLog(String(b!._id), false)).rejects.not.toBeInstanceOf(PermanentEmailError);
    expect((await EmailLog.findById(b!._id))!.status).toBe('RETRYING');
  });

  it('survives network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    const log = await newLog();
    await expect(processEmailLog(String(log!._id), false)).rejects.toThrow('ECONNRESET');
    expect((await EmailLog.findById(log!._id))!.status).toBe('RETRYING');
  });

  it('dedupe keys prevent duplicate logs', async () => {
    const a = await newLog({ dedupeKey: 'k1' });
    const b = await newLog({ dedupeKey: 'k1' });
    expect(String(a!._id)).toBe(String(b!._id));
    expect(await EmailLog.countDocuments()).toBe(1);
  });

  it('single-use token data is scrubbed from the log once sent', async () => {
    mockFetch(201);
    const log = await newLog({ template: 'PASSWORD_RESET', data: { name: 'A', url: 'https://x/reset?token=secret' } });
    await processEmailLog(String(log!._id), false);
    const saved = await EmailLog.findById(log!._id).select('+data');
    expect(saved!.data).toBeUndefined();
  });

  it('a Redis outage never breaks the request; the sweep re-queues stale emails', async () => {
    vi.mocked(enqueueEmailJob).mockRejectedValueOnce(new Error('redis down'));
    const log = await newLog();
    expect(log!.status).toBe('QUEUED');
    await EmailLog.updateOne({ _id: log!._id }, { updatedAt: new Date(Date.now() - 3600_000) }, { timestamps: false });
    vi.mocked(enqueueEmailJob).mockClear();
    expect(await requeueStaleEmails()).toBe(1);
    expect(enqueueEmailJob).toHaveBeenCalledWith(String(log!._id));
  });

  it('non-essential mail to an opted-out donor is SKIPPED, essential mail is still sent', async () => {
    const donor = await registerDonor();
    await DonorProfile.updateOne({ user: donor.id }, { 'preferences.nonEssentialEmails': false });
    const skipped = await newLog({ userId: donor.id, template: 'BLOOD_REQUIREMENT', category: 'NON_ESSENTIAL', data: {} });
    expect(skipped!.status).toBe('SKIPPED');
    const essential = await newLog({ userId: donor.id, template: 'PASSWORD_RESET', category: 'ESSENTIAL', data: { name: 'x', url: 'u' } });
    expect(essential!.status).toBe('QUEUED');
  });
});

describe('Brevo webhook', () => {
  const headers = { Authorization: 'Bearer webhook-secret-for-tests' };

  it('rejects requests without the shared secret', async () => {
    expect((await api().post(`${P}/webhooks/brevo`).send({ event: 'delivered' })).status).toBe(401);
    expect((await api().post(`${P}/webhooks/brevo`).set('Authorization', 'Bearer wrong').send({ event: 'delivered' })).status).toBe(401);
  });

  it('updates delivery status for delivered / bounced events and ignores unknown ids', async () => {
    mockFetch(201, { messageId: '<m-1@brevo>' });
    const log = await newLog();
    await processEmailLog(String(log!._id), false);
    const res = await api().post(`${P}/webhooks/brevo`).set(headers).send({ event: 'delivered', 'message-id': '<m-1@brevo>' });
    expect(res.status).toBe(200);
    expect((await EmailLog.findById(log!._id))!.status).toBe('DELIVERED');

    const unknown = await api().post(`${P}/webhooks/brevo`).set(headers).send([{ event: 'hard_bounce', 'message-id': '<nope>' }]);
    expect(unknown.body.data.processed).toBe(0);

    mockFetch(201, { messageId: '<m-2@brevo>' });
    const log2 = await newLog({ to: 'c@example.com' });
    await processEmailLog(String(log2!._id), false);
    await api().post(`${P}/webhooks/brevo`).set('x-webhook-secret', 'webhook-secret-for-tests').send({ event: 'hard_bounce', 'message-id': '<m-2@brevo>', reason: 'mailbox full' });
    expect(await EmailLog.findById(log2!._id)).toMatchObject({ status: 'BOUNCED' });
  });

  it('a late "sent" can never overwrite "delivered"', async () => {
    const log = await newLog();
    await EmailLog.updateOne({ _id: log!._id }, { status: 'DELIVERED', providerMessageId: '<z>' });
    await setEmailStatus(log!._id, 'SENT');
    expect((await EmailLog.findById(log!._id))!.status).toBe('DELIVERED');
  });

  it('a spam complaint switches off non-essential email for that donor', async () => {
    const donor = await registerDonor();
    const log = await newLog({ userId: donor.id });
    await EmailLog.updateOne({ _id: log!._id }, { providerMessageId: '<s>', status: 'SENT' });
    await api().post(`${P}/webhooks/brevo`).set(headers).send({ event: 'spam', 'message-id': '<s>' });
    expect((await DonorProfile.findOne({ user: donor.id }))!.preferences!.nonEssentialEmails).toBe(false);
  });
});

describe('email templates', () => {
  it('renders all 10 templates with subject, responsive HTML and plain text', () => {
    const samples: Record<string, any> = {
      WELCOME: { name: 'A', dashboardUrl: 'u' },
      EMAIL_VERIFICATION: { name: 'A', url: 'u' },
      PASSWORD_RESET: { name: 'A', url: 'u' },
      CERTIFICATE_SUBMITTED: { name: 'A', donationDate: new Date(), location: 'L' },
      CERTIFICATE_APPROVED: { name: 'A', donationDate: new Date(), location: 'L', points: 100, url: 'u' },
      CERTIFICATE_REJECTED: { name: 'A', donationDate: new Date(), reason: 'blurry', url: 'u' },
      BLOOD_REQUIREMENT: { name: 'A', url: 'u', unsubscribeUrl: 'u', requirement: { title: 't', bloodGroup: 'A+', hospitalName: 'h', address: 'a', city: 'c', state: 's', country: 'c', unitsRequired: 1, contactPerson: 'p', contactPhone: '1', description: 'd', urgency: 'LOW', lastDateToRespond: new Date() } },
      DONATION_FOLLOWUP: { name: 'A', donationDate: new Date(), url: 'u', unsubscribeUrl: 'u' },
      ACCOUNT_STATUS: { name: 'A', active: false, reason: 'policy' },
      ADMIN_NOTIFICATION: { title: 'T', message: 'M', details: [['k', 'v']] },
    };
    expect(Object.keys(samples).sort()).toEqual([...EMAIL_TEMPLATES].sort());
    for (const t of EMAIL_TEMPLATES) {
      const r = renderTemplate(t, samples[t]);
      expect(r.subject.length, t).toBeGreaterThan(3);
      expect(r.html, t).toContain('viewport');
      expect(r.text.length, t).toBeGreaterThan(5);
    }
  });

  it('the follow-up reminder never claims medical eligibility', () => {
    const r = renderTemplate('DONATION_FOLLOWUP', { name: 'A', donationDate: new Date(), url: 'u', unsubscribeUrl: 'u' });
    expect(r.html).toMatch(/not a medical eligibility decision/i);
    expect(r.html).not.toMatch(/you are now eligible|you're eligible|you are medically eligible/i);
  });
});
