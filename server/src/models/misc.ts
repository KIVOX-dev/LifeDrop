import { model, Schema } from 'mongoose';

/* ------------------------------ AdminActivityLog ------------------------------ */
const activitySchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorRole: { type: String },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activitySchema.index({ createdAt: -1 });
export const AdminActivityLog = model('AdminActivityLog', activitySchema);

/* ---------------------------------- RefreshToken ---------------------------------- */
const refreshSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBy: { type: Schema.Types.ObjectId },
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String },
  },
  { timestamps: true },
);
// Automatically purge expired tokens.
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = model('RefreshToken', refreshSchema);

/* ---------------------------------- SystemSetting ---------------------------------- */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export const SystemSetting = model('SystemSetting', settingSchema);
