import { InferSchemaType, model, Schema } from 'mongoose';

const pointsTransactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    donation: { type: Schema.Types.ObjectId, ref: 'Donation', required: true },
    type: { type: String, enum: ['DONATION_APPROVED', 'DONATION_REVERSED'], required: true },
    points: { type: Number, required: true },
    note: { type: String, maxlength: 300 },
    awardedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Idempotency guard: at most one award and one reversal per donation.
pointsTransactionSchema.index({ donation: 1, type: 1 }, { unique: true });
pointsTransactionSchema.index({ createdAt: -1 });

export type IPointsTransaction = InferSchemaType<typeof pointsTransactionSchema>;
export const PointsTransaction = model('PointsTransaction', pointsTransactionSchema);
