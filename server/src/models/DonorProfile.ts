import { InferSchemaType, model, Schema } from 'mongoose';
import { BLOOD_GROUPS } from '../utils/common';

const donorProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },
    city: { type: String, required: true, trim: true, maxlength: 80, index: true },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    profilePictureKey: { type: String },
    emergencyContact: {
      name: { type: String, trim: true, maxlength: 100 },
      phone: { type: String, trim: true, maxlength: 20 },
      relation: { type: String, trim: true, maxlength: 50 },
    },
    consent: {
      privacyAcceptedAt: { type: Date, required: true },
      termsAcceptedAt: { type: Date, required: true },
      version: { type: String, default: '1.0' },
    },
    isAvailable: { type: Boolean, default: true },
    privacy: {
      showOnLeaderboard: { type: Boolean, default: true },
    },
    preferences: {
      // Non-essential email preferences. Essential (account/security) emails are always sent.
      nonEssentialEmails: { type: Boolean, default: true },
      requirementAlerts: { type: Boolean, default: true },
      reminderEmails: { type: Boolean, default: true },
    },
    totalPoints: { type: Number, default: 0, min: 0 },
    totalVerifiedDonations: { type: Number, default: 0, min: 0 },
    lastDonationDate: { type: Date },
  },
  { timestamps: true },
);

donorProfileSchema.index({ totalPoints: -1 });
donorProfileSchema.index({ country: 1, state: 1, city: 1 });

export type IDonorProfile = InferSchemaType<typeof donorProfileSchema>;
export const DonorProfile = model('DonorProfile', donorProfileSchema);
