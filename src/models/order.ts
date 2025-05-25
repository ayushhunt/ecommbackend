import { Schema, model, Document, Types } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing', // Added processing status
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

interface IOrderItem {
  product: Types.ObjectId;
  quantity: number;
  price: number;
  name?: string; // Add product name for easier reference
  image?: string; // Add product image for easier reference
}

interface IOrder extends Document {
  user: string;
  items: IOrderItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  transactionId?: string;
  razorpayOrderId?: string; // Add Razorpay order ID
  razorpayPaymentId?: string; // Add Razorpay payment ID
  razorpaySignature?: string; // Add Razorpay signature
  deliveryStatus: DeliveryStatus;
  shippingAddress: {
    name: string; // Add name
    phone: string; // Add phone number
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  notes?: string; // Optional field for order notes
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>({
  user: { type: String,  required: true,unique: true },
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    name: { type: String }, // Optional but useful
    image: { type: String } // Optional but useful
  }],
  totalAmount: { type: Number, required: true, min: 0 },
  paymentStatus: { 
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING
  },
  paymentMethod: { type: String, required: true },
  transactionId: String,
  razorpayOrderId: String, // Store Razorpay order ID
  razorpayPaymentId: String, // Store Razorpay payment ID
  razorpaySignature: String, // Store Razorpay signature
  deliveryStatus: { 
    type: String,
    enum: Object.values(DeliveryStatus),
    default: DeliveryStatus.PENDING
  },
  shippingAddress: {
    name: { type: String, required: true }, // Add name field
    phone: { type: String, required: true }, // Add phone field
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true }
  },
  notes: String // Optional notes field
}, {
  timestamps: true
});

orderSchema.index({ user: 1, createdAt: -1 });

export const Order = model<IOrder>('Order', orderSchema);