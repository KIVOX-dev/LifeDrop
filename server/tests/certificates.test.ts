import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Certificate, Donation, DonorProfile, EmailLog, PointsTransaction, Reminder } from '../src/models';
import { awardPoints } from '../src/services/points.service';
import { storage } from '../src/services/storage.service';
import { api, auth, createStaff, P, pdf, png, registerDonor, resetDb, startDb, stopDb, today, uploadCertificate } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe('certificate upload', () => {
  it('stores the file privately under a random key and creates PENDING donation + certificate, with no points', async () => {
    const donor = await registerDonor();
    const res = await uploadCertificate(donor, { file: png(), filename: 'scan.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    const [key, , type] = (storage.upload as any).mock.calls[0];
    expect(key).toMatch(/^certificates\/[a-f0-9]{48}\.png$/);
    expect(key).not.toContain('scan');
    expect(type).toBe('image/png');

    const cert = await Certificate.findOne({ donor: donor.id });
    expect(cert!.status).toBe('PENDING');
    expect(cert!.storageKey).toBe(key);
    expect((await Donation.findOne({ donor: donor.id }))!.status).toBe('PENDING');
    expect(await PointsTransaction.countDocuments()).toBe(0);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(0);
    expect(await EmailLog.countDocuments({ to: donor.email, template: 'CERTIFICATE_SUBMITTED' })).toBe(1);
    // storage keys / hashes never leak to the client
    expect(JSON.stringify(res.body)).not.toContain(key);
  });

  it('rejects disallowed types, spoofed content, wrong extension, empty and oversized files', async () => {
    const donor = await registerDonor();
    const exe = await uploadCertificate(donor, { file: Buffer.from('MZ-not-a-doc'), filename: 'x.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(400);
    const spoof = await uploadCertificate(donor, { file: Buffer.from('<script>alert(1)</script>'), filename: 'x.pdf', contentType: 'application/pdf' });
    expect(spoof.status).toBe(400);
    expect(spoof.body.error.message).toMatch(/does not match/);
    const ext = await uploadCertificate(donor, { file: pdf(), filename: 'x.png', contentType: 'application/pdf' });
    expect(ext.status).toBe(400);
    const big = await uploadCertificate(donor, { file: Buffer.concat([pdf(), Buffer.alloc(6 * 1024 * 1024)]) });
    expect(big.status).toBe(400);
    expect(big.body.error.message).toMatch(/too large/i);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('validates the donation date and location', async () => {
    const donor = await registerDonor();
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    expect((await uploadCertificate(donor, { date: future })).status).toBe(400);
    expect((await uploadCertificate(donor, { date: '2001-01-01' })).status).toBe(400);
    expect((await uploadCertificate(donor, { location: 'x' })).status).toBe(400);
  });

  it('prevents duplicate donations for the same day and the same file being reused', async () => {
    const donor = await registerDonor();
    const other = await registerDonor();
    const file = pdf('same-file');
    expect((await uploadCertificate(donor, { file })).status).toBe(201);
    expect((await uploadCertificate(donor, { file: pdf() })).status).toBe(409); // same date
    expect((await uploadCertificate(other, { file })).status).toBe(409); // same file, other donor
    expect(await Donation.countDocuments()).toBe(1);
  });

  it('cleans up the stored object if the database write fails', async () => {
    const donor = await registerDonor();
    const spy = vi.spyOn(Certificate, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await uploadCertificate(donor);
    expect(res.status).toBe(500);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(await Donation.countDocuments()).toBe(0);
    spy.mockRestore();
  });

  it('only donors can upload', async () => {
    const admin = await createStaff('ADMIN');
    expect((await uploadCertificate(admin)).status).toBe(403);
  });
});

describe('certificate approval and points', () => {
  async function pending() {
    const donor = await registerDonor();
    const admin = await createStaff('ADMIN');
    const up = await uploadCertificate(donor);
    return { donor, admin, certId: up.body.data.certificate._id as string, donationId: up.body.data.donation._id as string };
  }

  it('approval credits exactly 100 points once, writes a ledger entry, schedules a reminder and emails the donor', async () => {
    const { donor, admin, certId, donationId } = await pending();
    const res = await api().post(`${P}/certificates/${certId}/approve`).set(auth(admin)).send({});
    expect(res.status).toBe(200);

    const profile = await DonorProfile.findOne({ user: donor.id });
    expect(profile!.totalPoints).toBe(100);
    expect(profile!.totalVerifiedDonations).toBe(1);
    const txs = await PointsTransaction.find({ user: donor.id });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ points: 100, type: 'DONATION_APPROVED' });
    expect(String(txs[0].donation)).toBe(donationId);

    const cert = await Certificate.findById(certId);
    expect(cert).toMatchObject({ status: 'APPROVED' });
    expect(String(cert!.reviewedBy)).toBe(admin.id);
    expect(cert!.reviewedAt).toBeInstanceOf(Date);
    expect((await Donation.findById(donationId))!.status).toBe('VERIFIED');
    expect(await Reminder.countDocuments({ donation: donationId, status: 'SCHEDULED' })).toBe(1);
    expect(await EmailLog.countDocuments({ to: donor.email, template: 'CERTIFICATE_APPROVED' })).toBe(1);
  });

  it('a second approval is refused and does not duplicate points', async () => {
    const { donor, admin, certId } = await pending();
    expect((await api().post(`${P}/certificates/${certId}/approve`).set(auth(admin)).send({})).status).toBe(200);
    expect((await api().post(`${P}/certificates/${certId}/approve`).set(auth(admin)).send({})).status).toBe(409);
    expect((await api().post(`${P}/certificates/${certId}/reject`).set(auth(admin)).send({ reason: 'changed my mind' })).status).toBe(409);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(100);
    expect(await PointsTransaction.countDocuments()).toBe(1);
  });

  it('concurrent approvals (several admins clicking at once) award points exactly once', async () => {
    const { donor, certId } = await pending();
    const admins = await Promise.all([createStaff('ADMIN'), createStaff('ADMIN'), createStaff('SUPER_ADMIN'), createStaff('ADMIN')]);
    const results = await Promise.all(admins.map((a) => api().post(`${P}/certificates/${certId}/approve`).set(auth(a)).send({})));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await PointsTransaction.countDocuments({ user: donor.id })).toBe(1);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(100);
    expect(await EmailLog.countDocuments({ template: 'CERTIFICATE_APPROVED' })).toBe(1);
  });

  it('awarding is idempotent at the service level too (retry after a crash)', async () => {
    const { donor, admin, certId, donationId } = await pending();
    await api().post(`${P}/certificates/${certId}/approve`).set(auth(admin)).send({});
    const donation = (await Donation.findById(donationId))!;
    expect(await awardPoints(donation)).toBe(false);
    expect(await awardPoints(donation)).toBe(false);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(100);
  });

  it('rejection requires a reason, awards nothing, notifies the donor, and frees the date for a new upload', async () => {
    const { donor, admin, certId } = await pending();
    expect((await api().post(`${P}/certificates/${certId}/reject`).set(auth(admin)).send({})).status).toBe(400);
    const res = await api().post(`${P}/certificates/${certId}/reject`).set(auth(admin)).send({ reason: 'Image is blurry' });
    expect(res.status).toBe(200);
    expect(await PointsTransaction.countDocuments()).toBe(0);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(0);
    const cert = await Certificate.findById(certId);
    expect(cert).toMatchObject({ status: 'REJECTED', rejectionReason: 'Image is blurry' });
    expect(await Reminder.countDocuments()).toBe(0);
    const mail = await EmailLog.findOne({ template: 'CERTIFICATE_REJECTED' }).select('+data');
    expect((mail!.data as any).reason).toBe('Image is blurry');
    // donor can upload a corrected certificate for the same day
    expect((await uploadCertificate(donor)).status).toBe(201);
  });

  it('invalidating a verified donation reverses the points once and cancels the reminder', async () => {
    const { donor, admin, certId, donationId } = await pending();
    await api().post(`${P}/certificates/${certId}/approve`).set(auth(admin)).send({});
    const res = await api().patch(`${P}/donations/${donationId}/status`).set(auth(admin)).send({ status: 'REJECTED', remarks: 'Certificate was forged' });
    expect(res.status).toBe(200);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(0);
    expect(await PointsTransaction.countDocuments({ type: 'DONATION_REVERSED' })).toBe(1);
    expect((await Reminder.findOne({ donation: donationId }))!.status).toBe('CANCELLED');
    expect((await api().patch(`${P}/donations/${donationId}/status`).set(auth(admin)).send({ status: 'REJECTED', remarks: 'again please' })).status).toBe(409);
    expect((await DonorProfile.findOne({ user: donor.id }))!.totalPoints).toBe(0);
  });

  it('a donor cannot approve their own certificate', async () => {
    const { donor, certId } = await pending();
    expect((await api().post(`${P}/certificates/${certId}/approve`).set(auth(donor)).send({})).status).toBe(403);
    expect(await PointsTransaction.countDocuments()).toBe(0);
  });
});

describe('certificate access', () => {
  it('issues short-lived signed URLs only to the owner and to admins', async () => {
    const owner = await registerDonor();
    const stranger = await registerDonor();
    const admin = await createStaff('ADMIN');
    const up = await uploadCertificate(owner, { date: today() });
    const id = up.body.data.certificate._id;

    const mine = await api().get(`${P}/certificates/${id}/download`).set(auth(owner));
    expect(mine.status).toBe(200);
    expect(mine.body.data.url).toMatch(/^https:\/\/b2\.test\/certificates\//);
    expect(mine.body.data.expiresIn).toBeLessThanOrEqual(300);
    expect((await api().get(`${P}/certificates/${id}/download?inline=1`).set(auth(admin))).status).toBe(200);
    expect((storage.signedUrl as any).mock.calls.at(-1)[1].inline).toBe(true);
    expect((await api().get(`${P}/certificates/${id}/download`).set(auth(stranger))).status).toBe(404);
    expect((await api().get(`${P}/certificates/${id}/download`)).status).toBe(401);
    expect((await api().get(`${P}/certificates/${id}`).set(auth(stranger))).status).toBe(404);
  });

  it('donors list only their own certificates; the response never exposes storage keys', async () => {
    const a = await registerDonor();
    const b = await registerDonor();
    await uploadCertificate(a);
    await uploadCertificate(b);
    const res = await api().get(`${P}/certificates/my-certificates`).set(auth(a));
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey|fileHash/);
  });

  it('donor can withdraw a pending certificate (file deleted) but not an approved one', async () => {
    const donor = await registerDonor();
    const admin = await createStaff('ADMIN');
    const up = await uploadCertificate(donor);
    const id = up.body.data.certificate._id;
    expect((await api().delete(`${P}/certificates/${id}`).set(auth(donor))).status).toBe(200);
    expect(storage.remove).toHaveBeenCalledTimes(1);

    const up2 = await uploadCertificate(donor);
    await api().post(`${P}/certificates/${up2.body.data.certificate._id}/approve`).set(auth(admin)).send({});
    expect((await api().delete(`${P}/certificates/${up2.body.data.certificate._id}`).set(auth(donor))).status).toBe(409);
  });
});
