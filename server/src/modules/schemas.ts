import { z } from 'zod';
import { BLOOD_GROUPS } from '../utils/common';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

export const bloodGroup = z.enum(BLOOD_GROUPS);

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number');

export const phone = z.string().trim().regex(/^[+\d][\d\s\-()]{6,18}$/, 'Enter a valid phone number');
export const email = z.string().trim().toLowerCase().email().max(254);
const text = (max: number, min = 1) => z.string().trim().min(min).max(max);

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateInput = z.coerce.date();

const adult = (d: Date) => {
  const now = new Date();
  const age = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
  return age >= 18 && age <= 100;
};

export const registerSchema = z.object({
  fullName: text(100, 2),
  email,
  phone,
  password,
  dateOfBirth: dateInput.refine(adult, 'You must be at least 18 years old to register as a donor'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  bloodGroup,
  city: text(80),
  state: text(80),
  country: text(80),
  address: text(300),
  emergencyContact: z
    .object({ name: text(100).optional(), phone: phone.optional(), relation: text(50).optional() })
    .optional(),
  acceptPrivacy: z.literal(true, 'You must accept the privacy policy'),
  acceptTerms: z.literal(true, 'You must accept the terms and conditions'),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(72) });

export const profileUpdateSchema = z
  .object({
    fullName: text(100, 2),
    phone,
    dateOfBirth: dateInput.refine(adult, 'You must be at least 18 years old'),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
    bloodGroup,
    city: text(80),
    state: text(80),
    country: text(80),
    address: text(300),
    emergencyContact: z.object({ name: text(100).optional(), phone: phone.optional(), relation: text(50).optional() }),
    privacy: z.object({ showOnLeaderboard: z.boolean() }).partial(),
    preferences: z.object({ nonEssentialEmails: z.boolean(), requirementAlerts: z.boolean(), reminderEmails: z.boolean() }).partial(),
  })
  .partial();

export const requirementSchema = z.object({
  title: text(150, 3),
  bloodGroup: z.enum([...BLOOD_GROUPS, 'ALL']),
  hospitalName: text(150),
  address: text(300),
  city: text(80),
  state: text(80),
  country: text(80),
  unitsRequired: z.coerce.number().int().min(1).max(1000),
  contactPerson: text(100),
  contactPhone: phone,
  contactEmail: z.union([email, z.literal('')]).optional(),
  description: text(2000, 10),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  lastDateToRespond: dateInput,
});
