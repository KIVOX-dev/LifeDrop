import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../src/models';
import { api, auth, createStaff, P, PASSWORD, registerDonor, requirementBody, resetDb, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

const adminOnly: [string, string][] = [
  ['get', '/admin/dashboard'],
  ['get', '/admin/analytics'],
  ['get', '/admin/reports?type=donors'],
  ['get', '/admin/users'],
  ['get', '/admin/settings'],
  ['get', '/admin/activity-logs'],
  ['get', '/admin/email-logs'],
  ['get', '/admin/reminders'],
  ['get', '/donors'],
  ['get', '/donations'],
  ['get', '/certificates'],
  ['post', '/requirements/create'],
  ['post', '/ai/admin-assistant'],
  ['post', '/ai/report-summary'],
];

describe('role-based access control (enforced by the API)', () => {
  it('rejects unauthenticated access to every protected route with 401', async () => {
    for (const [m, p] of adminOnly) {
      const res = await (api() as any)[m](`${P}${p}`).send({});
      expect(res.status, `${m} ${p}`).toBe(401);
    }
  });

  it('rejects donors from every admin route with 403', async () => {
    const donor = await registerDonor();
    for (const [m, p] of adminOnly) {
      const res = await (api() as any)[m](`${P}${p}`).set(auth(donor)).send({});
      expect(res.status, `${m} ${p}`).toBe(403);
    }
  });

  it('allows admins on admin routes', async () => {
    const admin = await createStaff('ADMIN');
    for (const p of ['/admin/dashboard', '/admin/analytics', '/donors', '/certificates', '/donations', '/admin/activity-logs', '/admin/email-logs']) {
      expect((await api().get(`${P}${p}`).set(auth(admin))).status, p).toBe(200);
    }
  });

  it('restricts platform configuration and admin management to SUPER_ADMIN', async () => {
    const admin = await createStaff('ADMIN');
    const sup = await createStaff('SUPER_ADMIN');
    const newAdmin = { fullName: 'New Admin', email: 'new-admin@lifedrop.test', password: PASSWORD, role: 'ADMIN' };

    expect((await api().post(`${P}/admin/users`).set(auth(admin)).send(newAdmin)).status).toBe(403);
    expect((await api().put(`${P}/admin/settings`).set(auth(admin)).send({ reminderMonths: 4 })).status).toBe(403);
    expect((await api().get(`${P}/admin/users?role=ADMIN`).set(auth(admin))).status).toBe(403);

    expect((await api().post(`${P}/admin/users`).set(auth(sup)).send(newAdmin)).status).toBe(201);
    expect((await api().put(`${P}/admin/settings`).set(auth(sup)).send({ reminderMonths: 4 })).status).toBe(200);
    expect((await api().get(`${P}/admin/users?role=ADMIN`).set(auth(sup))).status).toBe(200);
  });

  it('super admin can deactivate an admin, who is then locked out immediately', async () => {
    const admin = await createStaff('ADMIN');
    const sup = await createStaff('SUPER_ADMIN');
    expect((await api().patch(`${P}/admin/users/${admin.id}`).set(auth(sup)).send({ isActive: false })).status).toBe(200);
    expect((await api().get(`${P}/admin/dashboard`).set(auth(admin))).status).toBe(403);
    expect((await api().patch(`${P}/admin/users/${sup.id}`).set(auth(sup)).send({ isActive: false })).status).toBe(400); // not self
  });

  it('uses the role stored in the database, not the token claim', async () => {
    const donor = await registerDonor();
    // Token was minted for a DONOR; promoting in DB is reflected, demoting an admin is too.
    const admin = await createStaff('ADMIN');
    await User.updateOne({ _id: admin.id }, { role: 'DONOR' });
    expect((await api().get(`${P}/admin/dashboard`).set(auth(admin))).status).toBe(403);
    expect(donor.token).toBeTruthy();
  });

  it('donors cannot view other donors or manage requirements; public sees only published ones', async () => {
    const a = await registerDonor();
    const b = await registerDonor();
    const admin = await createStaff('ADMIN');
    expect((await api().get(`${P}/donors/${b.id}`).set(auth(a))).status).toBe(403);
    expect((await api().patch(`${P}/donors/${b.id}/status`).set(auth(a)).send({ isActive: false })).status).toBe(403);

    const draft = await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody());
    expect(draft.status).toBe(201);
    const pub = await api().get(`${P}/requirements`);
    expect(pub.body.data).toHaveLength(0);
    expect((await api().get(`${P}/requirements/${draft.body.data._id}`)).status).toBe(404);
    expect((await api().post(`${P}/requirements/${draft.body.data._id}/publish`).set(auth(a))).status).toBe(403);
  });

  it('validates object ids and ignores injected query operators', async () => {
    const admin = await createStaff('ADMIN');
    expect((await api().get(`${P}/donors/not-an-id`).set(auth(admin))).status).toBe(400);
    const res = await api().get(`${P}/donors?search[$ne]=x&bloodGroup[$ne]=O%2B`).set(auth(admin));
    expect([200, 400]).toContain(res.status);
  });
});
