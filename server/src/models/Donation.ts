import { InferSchemaType, model, Schema } from 'mongoose';
import { BLOOD_GROUPS } from '../utils/common';

export const DONATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;

const donationSchema = new Schema(
  {
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    donationDate: { type: Date, required: true },
    /** YYYY-MM-DD in the app timezone - used for duplicate detection. */
    donationDay: { type: String, required: true },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    certificate: { type: Schema.Types.ObjectId, ref: 'Certificate' },
    status: { type: String, enum: DONATION_STATUSES, default: 'PENDING', index: true },
    adminRemarks: { type: String, maxlength: 1000 },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// A donor can have only one live (pending or verified) donation record per calendar day.
donationSchema.index(
  { donor: 1, donationDay: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'VERIFIED'] } } },
);
donationSchema.index({ status: 1, donationDate: -1 });

export type IDonation = InferSchemaType<typeof donationSchema>;
export const Donation = model('Donation', donationSchema);
