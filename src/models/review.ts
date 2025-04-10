import { Schema, model, Document, Types } from 'mongoose';

interface IReview extends Document {
  user: string;
  product: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

const reviewSchema = new Schema<IReview>({
  user: { type: String, ref: 'User', required: true },
  product: { type: String, ref: 'Product', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
}, {
  timestamps: true
});

reviewSchema.index({ product: 1, user: 1 });

export const Review = model<IReview>('Review', reviewSchema);