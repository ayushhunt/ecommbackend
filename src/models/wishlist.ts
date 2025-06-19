import mongoose, { Schema, Document, Types } from 'mongoose';

// Interface for wishlist item
export interface IWishlistItem {
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  name: string;
  price: number;
  discount?: number;
  finalPrice?: number;
  image: string;
  color?: string;
  size?: string;
  sku?: string;
  addedAt: Date;
}

// Interface for wishlist document
export interface IWishlist extends Document {
  userId: string;
  items: IWishlistItem[];
  createdAt: Date;
  updatedAt: Date;
  populateProducts: () => Promise<IWishlist>;
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
        product: {
          type: Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        variantId: {
          type: Schema.Types.ObjectId,
          ref: 'Product.variants',
          default: null,
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
        discount: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },
        finalPrice: {
          type: Number,
          min: 0,
        },
        image: {
          type: String,
          required: true,
        },
        color: {
          type: String,
          default: null,
        },
        size: {
          type: String,
          default: null,
        },
        sku: {
          type: String,
          default: null,
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

// Pre-save middleware to calculate final prices
WishlistSchema.pre('save', function(this: IWishlist, next) {
  this.items.forEach(item => {
    const discount = item.discount || 0;
    item.finalPrice = item.price * (1 - discount / 100);
  });
  next();
});

// Method to populate product references
WishlistSchema.methods.populateProducts = async function() {
  return await this.populate({
    path: 'items.product',
    select: 'name images price discount hasVariants variants'
  });
};

// Create compound index for userId and product
WishlistSchema.index({ userId: 1, 'items.product': 1 });

export const Wishlist = mongoose.model<IWishlist>('Wishlist', WishlistSchema);