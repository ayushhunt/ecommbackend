import { Schema, model, Document, Types } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

interface IOrderItem {
  product: Types.ObjectId;
  quantity: number;
  price: number;
}

interface IOrder extends Document {
  user: Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  transactionId?: string;
  deliveryStatus: DeliveryStatus;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  }],
  totalAmount: { type: Number, required: true, min: 0 },
  paymentStatus: { 
    type: String, 
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING
  },
  paymentMethod: { type: String, required: true },
  transactionId: String,
  deliveryStatus: { 
    type: String, 
    enum: Object.values(DeliveryStatus),
    default: DeliveryStatus.PENDING
  },
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    zipCode: { type: String, required: true }
  }
}, {
  timestamps: true
});

orderSchema.index({ user: 1, createdAt: -1 });

export const Order = model<IOrder>('Order', orderSchema);