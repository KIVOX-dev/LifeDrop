import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DonorProfile, EmailLog, RefreshToken, User } from '../src/models';
import { api, auth, createStaff, donorBody, P, PASSWORD, registerDonor, resetDb, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

describe('donor registration', () => {
  it('registers a donor, hashes the password, creates a profile and queues a verification email', async () => {
    const body = donorBody();
    const res = await api().post(`${P}/auth/register`).send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.role).toBe('DONOR');
    const user = await User.findOne({ email: body.email }).select('+passwordHash');
    expect(user!.passwordHash).not.toBe(body.password);
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await DonorProfile.countDocuments({ user: user!._id })).toBe(1);
    const log = await EmailLog.findOne({ to: body.email, template: 'EMAIL_VERIFICATION' });
    expect(log?.status).toBe('QUEUED');
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/ld_refresh=.*HttpOnly/i);
  });

  it('cannot self-register as an admin (role in body is ignored)', async () => {
    const res = await api().post(`${P}/auth/register`).send({ ...donorBody(), role: 'SUPER_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('DONOR');
  });

  it('rejects duplicate emails, weak passwords, minors and missing consent', async () => {
    const s = await registerDonor();
    expect((await api().post(`${P}/auth/register`).send(donorBody({ email: s.email }))).status).toBe(409);
    expect((await api().post(`${P}/auth/register`).send(donorBody({ password: 'weak' }))).status).toBe(400);
    const minor = new Date(Date.now() - 10 * 365 * 86400_000).toISOString().slice(0, 10);
    expect((await api().post(`${P}/auth/register`).send(donorBody({ dateOfBirth: minor }))).status).toBe(400);
    expect((await api().post(`${P}/auth/register`).send(donorBody({ acceptPrivacy: false }))).status).toBe(400);
    expect((await api().post(`${P}/auth/register`).send(donorBody({ bloodGroup: 'Z+' }))).status).toBe(400);
  });

  it('is not vulnerable to NoSQL operator injection on login', async () => {
    await registerDonor();
    const res = await api().post(`${P}/auth/login`).send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });
});

describe('login / sessions', () => {
  it('logs in and returns generic errors for bad credentials', async () => {
    const s = await registerDonor();
    const ok = await api().post(`${P}/auth/login`).send({ email: s.email, password: PASSWORD });
    expect(ok.status).toBe(200);
    const bad = await api().post(`${P}/auth/login`).send({ email: s.email, password: 'Wrong-pass1' });
    const unknown = await api().post(`${P}/auth/login`).send({ email: 'nobody@example.com', password: 'Wrong-pass1' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks deactivated accounts, even with a previously valid token', async () => {
    const s = await registerDonor();
    await User.updateOne({ _id: s.id }, { isActive: false });
    expect((await api().get(`${P}/auth/me`).set(auth(s))).status).toBe(403);
    expect((await api().post(`${P}/auth/login`).send({ email: s.email, password: PASSWORD })).status).toBe(403);
  });

  it('GET /auth/me requires a valid token', async () => {
    expect((await api().get(`${P}/auth/me`)).status).toBe(401);
    expect((await api().get(`${P}/auth/me`).set('Authorization', 'Bearer garbage')).status).toBe(401);
    const s = await registerDonor();
    const me = await api().get(`${P}/auth/me`).set(auth(s));
    expect(me.status).toBe(200);
    expect(me.body.data.profile.bloodGroup).toBe('O+');
  });

  it('rotates refresh tokens and detects re-use of an old token', async () => {
    const s = await registerDonor();
    const first = await api().post(`${P}/auth/refresh`).set('Cookie', s.cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toBeTruthy();
    const newCookie = first.headers['set-cookie'] as unknown as string[];
    expect(newCookie[0]).not.toEqual(s.cookie[0]);

    // Replaying the OLD token is theft: the whole family is revoked ...
    const replay = await api().post(`${P}/auth/refresh`).set('Cookie', s.cookie);
    expect(replay.status).toBe(401);
    // ... including the newly issued token.
    const afterRevoke = await api().post(`${P}/auth/refresh`).set('Cookie', newCookie);
    expect(afterRevoke.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const s = await registerDonor();
    expect((await api().post(`${P}/auth/logout`).set('Cookie', s.cookie)).status).toBe(200);
    expect((await api().post(`${P}/auth/refresh`).set('Cookie', s.cookie)).status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
  });
});

describe('email verification & password reset', () => {
  it('verifies email with the emailed token (single use) and sends a welcome email', async () => {
    const s = await registerDonor({}, false);
    const log = await EmailLog.findOne({ to: s.email, template: 'EMAIL_VERIFICATION' }).select('+data');
    const token = new URL((log!.data as any).url).searchParams.get('token')!;
    expect((await api().post(`${P}/auth/verify-email`).send({ token })).status).toBe(200);
    expect((await User.findById(s.id))!.emailVerified).toBe(true);
    expect(await EmailLog.countDocuments({ to: s.email, template: 'WELCOME' })).toBe(1);
    expect((await api().post(`${P}/auth/verify-email`).send({ token })).status).toBe(400);
  });

  it('forgot-password never reveals whether the account exists, and reset works once', async () => {
    const s = await registerDonor();
    const unknown = await api().post(`${P}/auth/forgot-password`).send({ email: 'ghost@example.com' });
    const known = await api().post(`${P}/auth/forgot-password`).send({ email: s.email });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(await EmailLog.countDocuments({ to: 'ghost@example.com' })).toBe(0);

    const log = await EmailLog.findOne({ to: s.email, template: 'PASSWORD_RESET' }).select('+data');
    const token = new URL((log!.data as any).url).searchParams.get('token')!;
    const reset = await api().post(`${P}/auth/reset-password`).send({ token, password: 'NewPassw0rd!' });
    expect(reset.status).toBe(200);
    expect((await api().post(`${P}/auth/reset-password`).send({ token, password: 'AnotherPassw0rd' })).status).toBe(400);
    expect((await api().post(`${P}/auth/login`).send({ email: s.email, password: PASSWORD })).status).toBe(401);
    expect((await api().post(`${P}/auth/login`).send({ email: s.email, password: 'NewPassw0rd!' })).status).toBe(200);
    // old sessions are revoked
    expect((await api().post(`${P}/auth/refresh`).set('Cookie', s.cookie)).status).toBe(401);
  });

  it('change-password requires the current password', async () => {
    const s = await registerDonor();
    expect((await api().post(`${P}/auth/change-password`).set(auth(s)).send({ currentPassword: 'nope', newPassword: 'NewPassw0rd!' })).status).toBe(400);
    expect((await api().post(`${P}/auth/change-password`).set(auth(s)).send({ currentPassword: PASSWORD, newPassword: 'NewPassw0rd!' })).status).toBe(200);
  });

  it('staff can log in through the same endpoint', async () => {
    const a = await createStaff('ADMIN');
    const res = await api().post(`${P}/auth/login`).send({ email: a.email, password: PASSWORD });
    expect(res.body.data.user.role).toBe('ADMIN');
  });
});
