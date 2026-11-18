import { InferSchemaType, model, Schema } from 'mongoose';

export const REMINDER_STATUSES = ['SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'] as const;

const schema = new Schema(
  {
    // One reminder per donation: duplicate jobs are impossible by construction.
    donation: { type: Schema.Types.ObjectId, ref: 'Donation', required: true, unique: true },
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledFor: { type: Date, required: true },
    timezone: { type: String, required: true },
    status: { type: String, enum: REMINDER_STATUSES, default: 'SCHEDULED' },
    sentAt: { type: Date },
    emailLog: { type: Schema.Types.ObjectId, ref: 'EmailLog' },
    lastError: { type: String, maxlength: 500 },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

schema.index({ status: 1, scheduledFor: 1 });

export type IReminder = InferSchemaType<typeof schema>;
export const Reminder = model('Reminder', schema);
