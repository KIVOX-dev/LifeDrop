import bcrypt from 'bcrypt';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models';

let mongod: MongoMemoryServer;
export const app = createApp();
export const api = () => request(app);
export const P = '/api/v1';

export async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await mongoose.syncIndexes();
}
export async function stopDb() {
  await mongoose.disconnect();
  await mongod?.stop();
}
export async function resetDb() {
  const cols = await mongoose.connection.db!.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

export const PASSWORD = 'Str0ngPassw0rd';
let n = 0;
export const donorBody = (over: Record<string, unknown> = {}) => ({
  fullName: `Test Donor ${++n}`,
  email: `donor${n}-${crypto.randomBytes(3).toString('hex')}@example.com`,
  phone: '+919876543210',
  password: PASSWORD,
  dateOfBirth: '1995-05-20',
  gender: 'FEMALE',
  bloodGroup: 'O+',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  address: '12 Test Street',
  acceptPrivacy: true,
  acceptTerms: true,
  ...over,
});

export interface Session { token: string; id: string; email: string; cookie: string[] }

export async function registerDonor(over: Record<string, unknown> = {}, verify = true): Promise<Session> {
  const body = donorBody(over);
  const res = await api().post(`${P}/auth/register`).send(body);
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const id = res.body.data.user._id;
  if (verify) await User.updateOne({ _id: id }, { emailVerified: true });
  return { token: res.body.data.accessToken, id, email: body.email, cookie: res.headers['set-cookie'] as unknown as string[] };
}

export async function createStaff(role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN'): Promise<Session> {
  const email = `${role.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}@lifedrop.test`;
  const u = await User.create({ fullName: `${role} User`, email, role, emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await api().post(`${P}/auth/login`).send({ email, password: PASSWORD });
  return { token: res.body.data.accessToken, id: String(u._id), email, cookie: res.headers['set-cookie'] as unknown as string[] };
}

export const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

/** Unique valid PDF so the duplicate-file guard does not trip between tests. */
export const pdf = (tag = crypto.randomBytes(8).toString('hex')) => Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`);
export const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(32)]);

export const today = () => new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);

export async function uploadCertificate(s: Session, over: { date?: string; location?: string; file?: Buffer; filename?: string; contentType?: string } = {}) {
  return api()
    .post(`${P}/certificates/upload`)
    .set(auth(s))
    .field('donationDate', over.date ?? today())
    .field('location', over.location ?? 'City Blood Bank')
    .attach('certificate', over.file ?? pdf(), { filename: over.filename ?? 'cert.pdf', contentType: over.contentType ?? 'application/pdf' });
}

export const requirementBody = (over: Record<string, unknown> = {}) => ({
  title: 'Urgent O+ blood needed',
  bloodGroup: 'O+',
  hospitalName: 'City General Hospital',
  address: '1 Hospital Road',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  unitsRequired: 3,
  contactPerson: 'Dr. Rao',
  contactPhone: '+919812345678',
  contactEmail: 'blood@cgh.example',
  description: 'Patient undergoing surgery needs blood urgently.',
  urgency: 'HIGH',
  lastDateToRespond: new Date(Date.now() + 5 * 86400_000).toISOString(),
  ...over,
});
