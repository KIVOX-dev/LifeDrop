import { InferSchemaType, model, Schema } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'CERTIFICATE_SUBMITTED',
  'CERTIFICATE_APPROVED',
  'CERTIFICATE_REJECTED',
  'NEW_REQUIREMENT',
  'DONATION_REMINDER',
  'ACCOUNT',
] as const;

const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 150 },
    message: { type: String, required: true, maxlength: 500 },
    link: { type: String, maxlength: 200 },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ user: 1, createdAt: -1 });
schema.index({ user: 1, readAt: 1 });

export type INotification = InferSchemaType<typeof schema>;
export const Notification = model('Notification', schema);
