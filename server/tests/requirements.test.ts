import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DonorProfile, EmailLog, Notification, RequirementNotification, User } from '../src/models';
import { processEmailLog, setEmailStatus } from '../src/services/email.service';
import { renderTemplate } from '../src/services/email.templates';
import { api, auth, createStaff, P, registerDonor, requirementBody, resetDb, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

async function donors() {
  const oPos1 = await registerDonor({ bloodGroup: 'O+' });
  const oPos2 = await registerDonor({ bloodGroup: 'O+' });
  const bPos = await registerDonor({ bloodGroup: 'B+' });
  const abNeg = await registerDonor({ bloodGroup: 'AB-' });
  const optedOut = await registerDonor({ bloodGroup: 'O+' });
  const unavailable = await registerDonor({ bloodGroup: 'O+' });
  const unverified = await registerDonor({ bloodGroup: 'O+' }, false);
  const inactive = await registerDonor({ bloodGroup: 'O+' });
  const alertsOff = await registerDonor({ bloodGroup: 'O+' });
  await DonorProfile.updateOne({ user: optedOut.id }, { 'preferences.nonEssentialEmails': false });
  await DonorProfile.updateOne({ user: unavailable.id }, { isAvailable: false });
  await User.updateOne({ _id: inactive.id }, { isActive: false });
  await DonorProfile.updateOne({ user: alertsOff.id }, { 'preferences.requirementAlerts': false });
  return { oPos1, oPos2, bPos, abNeg, optedOut, unavailable, unverified, inactive, alertsOff };
}

const recipients = async (reqId: string) => (await RequirementNotification.find({ requirement: reqId }).lean()).map((n) => String(n.donor)).sort();

describe('blood requirement targeting', () => {
  it('O+ requirement notifies only matching, opted-in, active, verified, available donors', async () => {
    const admin = await createStaff('ADMIN');
    const d = await donors();
    const created = await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody({ bloodGroup: 'O+' }));
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    const pub = await api().post(`${P}/requirements/${id}/publish`).set(auth(admin));
    expect(pub.status).toBe(200);
    expect(pub.body.data.emailsQueued).toBe(2);
    expect(await recipients(id)).toEqual([d.oPos1.id, d.oPos2.id].sort());
    expect(await EmailLog.countDocuments({ template: 'BLOOD_REQUIREMENT' })).toBe(2);
    expect(await Notification.countDocuments({ type: 'NEW_REQUIREMENT' })).toBe(2);
  });

  it('B+ requirement notifies only B+ donors', async () => {
    const admin = await createStaff('ADMIN');
    const d = await donors();
    const id = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody({ bloodGroup: 'B+' }))).body.data._id;
    await api().post(`${P}/requirements/${id}/publish`).set(auth(admin));
    expect(await recipients(id)).toEqual([d.bPos.id]);
  });

  it('ALL notifies every eligible opted-in donor and still skips opted-out accounts', async () => {
    const admin = await createStaff('ADMIN');
    const d = await donors();
    const id = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody({ bloodGroup: 'ALL' }))).body.data._id;
    await api().post(`${P}/requirements/${id}/publish`).set(auth(admin));
    expect(await recipients(id)).toEqual([d.oPos1.id, d.oPos2.id, d.bPos.id, d.abNeg.id].sort());
    const skippedIds = [d.optedOut, d.unavailable, d.unverified, d.inactive, d.alertsOff].map((x) => x.id);
    const sent = await EmailLog.find({ template: 'BLOOD_REQUIREMENT' }).lean();
    for (const id2 of skippedIds) expect(sent.find((l) => String(l.user) === id2)).toBeUndefined();
  });

  it('never sends to a donor who unsubscribes after queueing (re-checked at send time)', async () => {
    const admin = await createStaff('ADMIN');
    const donor = await registerDonor({ bloodGroup: 'O+' });
    const id = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody())).body.data._id;
    await api().post(`${P}/requirements/${id}/publish`).set(auth(admin));
    await DonorProfile.updateOne({ user: donor.id }, { 'preferences.requirementAlerts': false });
    const log = await EmailLog.findOne({ to: donor.email, template: 'BLOOD_REQUIREMENT' });
    expect(await processEmailLog(String(log!._id), false)).toBe('skipped');
    expect((await EmailLog.findById(log!._id))!.status).toBe('SKIPPED');
    expect((await RequirementNotification.findOne({ requirement: id, donor: donor.id }))!.status).toBe('SKIPPED');
  });

  it('cannot publish twice or re-dispatch duplicates; re-dispatch only reaches new donors', async () => {
    const admin = await createStaff('ADMIN');
    await registerDonor({ bloodGroup: 'O+' });
    const id = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody())).body.data._id;
    const [a, b] = await Promise.all([api().post(`${P}/requirements/${id}/publish`).set(auth(admin)), api().post(`${P}/requirements/${id}/publish`).set(auth(admin))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await EmailLog.countDocuments({ template: 'BLOOD_REQUIREMENT' })).toBe(1);

    const again = await api().post(`${P}/requirements/${id}/notifications`).set(auth(admin));
    expect(again.body.data.newlyQueued).toBe(0);
    await registerDonor({ bloodGroup: 'O+' });
    const late = await api().post(`${P}/requirements/${id}/notifications`).set(auth(admin));
    expect(late.body.data.newlyQueued).toBe(1);
    expect(await EmailLog.countDocuments({ template: 'BLOOD_REQUIREMENT' })).toBe(2);
    expect(await RequirementNotification.countDocuments({ requirement: id })).toBe(2);
  });

  it('reports target / queued / delivered / failed / pending counts', async () => {
    const admin = await createStaff('ADMIN');
    for (let i = 0; i < 4; i++) await registerDonor({ bloodGroup: 'O+' });
    const draft = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody())).body.data._id;
    const preview = await api().get(`${P}/requirements/${draft}/notifications`).set(auth(admin));
    expect(preview.body.data.stats).toMatchObject({ targetDonors: 4, estimated: true });

    await api().post(`${P}/requirements/${draft}/publish`).set(auth(admin));
    const logs = await EmailLog.find({ template: 'BLOOD_REQUIREMENT' }).sort({ _id: 1 });
    await setEmailStatus(logs[0]._id, 'SENT', { providerMessageId: 'm1' });
    await setEmailStatus(logs[0]._id, 'DELIVERED');
    await setEmailStatus(logs[1]._id, 'SENT', { providerMessageId: 'm2' });
    await setEmailStatus(logs[2]._id, 'FAILED', { lastError: 'bounce' });

    const res = await api().get(`${P}/requirements/${draft}/notifications`).set(auth(admin));
    expect(res.body.data.stats).toMatchObject({ targetDonors: 4, delivered: 1, sent: 1, failed: 1, queued: 1, pending: 1 });
    expect(res.body.data.items).toHaveLength(4);
  });

  it('every requirement email contains all mandatory details', () => {
    const r = {
      title: 'Urgent', bloodGroup: 'O+', hospitalName: 'City General', address: '1 Road', city: 'Pune', state: 'MH', country: 'India', unitsRequired: 3,
      contactPerson: 'Dr Rao', contactPhone: '+91981', contactEmail: 'b@c.in', description: 'Surgery tomorrow', urgency: 'HIGH', lastDateToRespond: new Date('2030-01-05'),
    };
    const out = renderTemplate('BLOOD_REQUIREMENT', { name: 'Asha', requirement: r, url: 'https://x/y', unsubscribeUrl: 'https://x/unsub' });
    for (const needle of ['O+', 'City General', '1 Road, Pune, MH, India', '3', 'Dr Rao', '+91981', 'Surgery tomorrow', 'Jan 2030', 'Unsubscribe']) {
      expect(out.html, needle).toContain(needle);
    }
    expect(out.text).toContain('City General');
    expect(out.html).toMatch(/does not determine medical compatibility/i);
  });

  it('escapes HTML in user supplied fields', () => {
    const out = renderTemplate('BLOOD_REQUIREMENT', {
      name: '<b>x</b>', url: 'u', unsubscribeUrl: 'u',
      requirement: { title: '<script>1</script>', bloodGroup: 'A+', hospitalName: '<img src=x onerror=1>', address: 'a', city: 'c', state: 's', country: 'c', unitsRequired: 1, contactPerson: 'p', contactPhone: '1', description: '<script>alert(1)</script>', urgency: 'LOW', lastDateToRespond: new Date() },
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('<img src=x');
  });

  it('public list hides contact details from anonymous visitors, shows only open published items, and close works', async () => {
    const admin = await createStaff('ADMIN');
    const donor = await registerDonor();
    const id = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody())).body.data._id;
    await api().post(`${P}/requirements/${id}/publish`).set(auth(admin));
    const anon = await api().get(`${P}/requirements`);
    expect(anon.body.data).toHaveLength(1);
    expect(anon.body.data[0].contactPhone).toBeUndefined();
    expect(anon.body.data[0].hospitalName).toBe('City General Hospital');
    const authed = await api().get(`${P}/requirements`).set(auth(donor));
    expect(authed.body.data[0].contactPhone).toBeTruthy();

    expect((await api().post(`${P}/requirements/${id}/close`).set(auth(admin))).status).toBe(200);
    expect((await api().get(`${P}/requirements`)).body.data).toHaveLength(0);
    expect((await api().post(`${P}/requirements/${id}/publish`).set(auth(admin))).status).toBe(409);
  });

  it('validates input and refuses past deadlines', async () => {
    const admin = await createStaff('ADMIN');
    expect((await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody({ bloodGroup: 'XX' }))).status).toBe(400);
    expect((await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody({ unitsRequired: 0 }))).status).toBe(400);
    const past = (await api().post(`${P}/requirements/create`).set(auth(admin)).send(requirementBody({ lastDateToRespond: new Date(Date.now() - 86400_000).toISOString() }))).body.data._id;
    expect((await api().post(`${P}/requirements/${past}/publish`).set(auth(admin))).status).toBe(400);
  });
});
