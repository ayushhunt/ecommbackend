import mongoose, { Schema, Document } from 'mongoose';

// Interface for wishlist item
export interface IWishlistItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  addedAt: Date;
}

// Interface for wishlist document
export interface IWishlist extends Document {
  userId: string;
  items: IWishlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

// Create wishlist schema
const WishlistSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    items: [
      {
        productId: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        image: {
          type: String,
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IWishlist>('Wishlist', WishlistSchema);