import { InferSchemaType, model, Schema } from 'mongoose';

export const REQ_NOTIF_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;

const schema = new Schema(
  {
    requirement: { type: Schema.Types.ObjectId, ref: 'BloodRequirement', required: true, index: true },
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: REQ_NOTIF_STATUSES, default: 'QUEUED', index: true },
    emailLog: { type: Schema.Types.ObjectId, ref: 'EmailLog' },
    error: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

// Prevents duplicate notifications for the same requirement + donor.
schema.index({ requirement: 1, donor: 1 }, { unique: true });

export type IRequirementNotification = InferSchemaType<typeof schema>;
export const RequirementNotification = model('RequirementNotification', schema);
