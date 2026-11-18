import { InferSchemaType, model, Schema } from 'mongoose';

export const EMAIL_TEMPLATES = [
  'WELCOME',
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'CERTIFICATE_SUBMITTED',
  'CERTIFICATE_APPROVED',
  'CERTIFICATE_REJECTED',
  'BLOOD_REQUIREMENT',
  'DONATION_FOLLOWUP',
  'ACCOUNT_STATUS',
  'ADMIN_NOTIFICATION',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export const EMAIL_STATUSES = ['QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'SKIPPED'] as const;

const schema = new Schema(
  {
    to: { type: String, required: true, lowercase: true, index: true },
    toName: { type: String },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    template: { type: String, enum: EMAIL_TEMPLATES, required: true, index: true },
    category: { type: String, enum: ['ESSENTIAL', 'NON_ESSENTIAL'], default: 'ESSENTIAL' },
    subject: { type: String },
    /** Template variables. Never contains secrets other than single-use links needed by the template. */
    data: { type: Schema.Types.Mixed, select: false },
    status: { type: String, enum: EMAIL_STATUSES, default: 'QUEUED', index: true },
    providerMessageId: { type: String, index: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, maxlength: 500 },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    requirement: { type: Schema.Types.ObjectId, ref: 'BloodRequirement', index: true },
    dedupeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });

export type IEmailLog = InferSchemaType<typeof schema>;
export const EmailLog = model('EmailLog', schema);
