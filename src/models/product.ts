import { Schema, model, Document, Types } from 'mongoose';

interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  stock: number;
  ratings?: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true },
  images: { type: [String], required: true },
  stock: { type: Number, required: true, min: 0 },
  ratings: { type: Number, default: 0, min: 0, max: 5 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productSchema.index({ name: 'text', description: 'text' });

export const Product = model<IProduct>('Product', productSchema);