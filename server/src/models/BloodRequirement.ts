import { InferSchemaType, model, Schema } from 'mongoose';
import { BLOOD_GROUPS } from '../utils/common';

export const URGENCY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const REQ_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;

const bloodRequirementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    /** Specific blood group or ALL. */
    bloodGroup: { type: String, enum: [...BLOOD_GROUPS, 'ALL'], required: true, index: true },
    hospitalName: { type: String, required: true, trim: true, maxlength: 150 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    city: { type: String, required: true, trim: true, maxlength: 80, index: true },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    unitsRequired: { type: Number, required: true, min: 1, max: 1000 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 100 },
    contactPhone: { type: String, required: true, trim: true, maxlength: 20 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    urgency: { type: String, enum: URGENCY, default: 'MEDIUM' },
    lastDateToRespond: { type: Date, required: true },
    status: { type: String, enum: REQ_STATUSES, default: 'DRAFT', index: true },
    publishedAt: { type: Date },
    closedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, index: true },
  },
  { timestamps: true },
);

bloodRequirementSchema.index({ status: 1, lastDateToRespond: 1 });

export type IBloodRequirement = InferSchemaType<typeof bloodRequirementSchema>;
export const BloodRequirement = model('BloodRequirement', bloodRequirementSchema);
