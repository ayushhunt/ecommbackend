import mongoose, { Schema, Document } from 'mongoose';

// Interface for cart item
export interface ICartItem {
  productId: string;
  name: string;
  price: number;
  discount?: number;
  finalPrice?: number;
  quantity: number;
  image: string;
}

// Interface for cart document
export interface ICart extends Document {
  userId: string;
  items: ICartItem[];
  totalPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

// Create cart schema
const CartSchema: Schema = new Schema(
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
        quantity: {
          type: Number,
          required: true,
          min: 1,
          default: 1,
        },
        image: {
          type: String,
          required: true,
        },
      },
    ],
    totalPrice: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to calculate total price
CartSchema.pre('save', function (this: Document & ICart, next) {
  this.items.forEach(item => {
    const discount = item.discount || 0;
    item.finalPrice = item.price * (1 - discount / 100);
  });

  this.totalPrice = this.items.reduce(
    (acc, item) => acc + (item.finalPrice || item.price) * item.quantity,
    0
  );

  next();
});


export const Cart = mongoose.model<ICart>('Cart', CartSchema);