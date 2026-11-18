import { z } from 'zod';
import { BLOOD_GROUPS } from '@/lib/utils';

const phone = z.string().trim().regex(/^[+\d][\d\s\-()]{6,18}$/, 'Enter a valid phone number');

export const profileSchemaClient = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  phone,
  bloodGroup: z.enum(BLOOD_GROUPS),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().min(1, 'State is required'),
  country: z.string().trim().min(1, 'Country is required'),
  address: z.string().trim().min(5, 'Enter your address'),
  gender: z.enum(['', 'MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  emergencyName: z.string().trim().max(100).optional(),
  emergencyPhone: z.union([phone, z.literal('')]).optional(),
});
