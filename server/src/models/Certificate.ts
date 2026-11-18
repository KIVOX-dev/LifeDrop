import { InferSchemaType, model, Schema } from 'mongoose';

export const CERT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

const certificateSchema = new Schema(
  {
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    donation: { type: Schema.Types.ObjectId, ref: 'Donation', required: true, unique: true },
    storageKey: { type: String, required: true, unique: true },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    fileHash: { type: String, required: true },
    status: { type: String, enum: CERT_STATUSES, default: 'PENDING', index: true },
    rejectionReason: { type: String, maxlength: 1000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// The same file cannot back two live certificates.
certificateSchema.index(
  { fileHash: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['PENDING', 'APPROVED'] } } },
);

export type ICertificate = InferSchemaType<typeof certificateSchema>;
export const Certificate = model('Certificate', certificateSchema);
