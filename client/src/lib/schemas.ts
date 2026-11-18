import { z } from 'zod';
import { BLOOD_GROUPS } from './utils';

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a number');

const phone = z.string().trim().regex(/^[+\d][\d\s\-()]{6,18}$/, 'Enter a valid phone number');

const isAdult = (v: string) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age >= 18 && age <= 100;
};

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(100),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
    phone,
    password: passwordRule,
    confirmPassword: z.string(),
    dateOfBirth: z.string().min(1, 'Date of birth is required').refine(isAdult, 'You must be at least 18 years old'),
    gender: z.enum(['', 'MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
    bloodGroup: z.enum(BLOOD_GROUPS, { message: 'Select your blood group' }),
    city: z.string().trim().min(1, 'City is required').max(80),
    state: z.string().trim().min(1, 'State is required').max(80),
    country: z.string().trim().min(1, 'Country is required').max(80),
    address: z.string().trim().min(5, 'Enter your address').max(300),
    emergencyName: z.string().trim().max(100).optional(),
    emergencyPhone: z.union([phone, z.literal('')]).optional(),
    acceptPrivacy: z.boolean().refine((v) => v, 'You must accept the privacy policy'),
    acceptTerms: z.boolean().refine((v) => v, 'You must accept the terms'),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export type RegisterForm = z.infer<typeof registerSchema>;

export const uploadSchema = z.object({
  donationDate: z.string().min(1, 'Donation date is required').refine((v) => new Date(v) <= new Date(), 'Date cannot be in the future'),
  location: z.string().trim().min(2, 'Enter the hospital or blood bank').max(200),
});

export const requirementSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(150),
  bloodGroup: z.enum([...BLOOD_GROUPS, 'ALL'], { message: 'Select a blood group' }),
  hospitalName: z.string().trim().min(1, 'Hospital / blood bank is required').max(150),
  address: z.string().trim().min(1, 'Address is required').max(300),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  country: z.string().trim().min(1, 'Country is required'),
  unitsRequired: z.coerce.number().int().min(1, 'At least 1 unit').max(1000),
  contactPerson: z.string().trim().min(1, 'Contact person is required'),
  contactPhone: phone,
  contactEmail: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).optional(),
  description: z.string().trim().min(10, 'Add at least 10 characters').max(2000),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  lastDateToRespond: z.string().min(1, 'Deadline is required'),
});
