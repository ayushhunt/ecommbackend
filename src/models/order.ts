import { Schema, model, Document, Types } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

// Updated Order Item Interface
interface IOrderItem {
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  quantity: number;
  price: number;
  discount?: number;
  finalPrice?: number;
  name: string;
  image: string;
  color?: string;
  size?: string;
  sku?: string;
}

interface IOrder extends Document {
  user: string;
  items: IOrderItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  transactionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  deliveryStatus: DeliveryStatus;
  shippingAddress: {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  populateProducts: () => Promise<IOrder>;
}

const orderSchema = new Schema<IOrder>({
  user: { 
    type: String,  
    required: true,
    index: true 
  },
  items: [{
    product: { 
      type: Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true 
    },
    variantId: { 
      type: Schema.Types.ObjectId,
      ref: 'Product.variants',
      default: null
    },
    quantity: { 
      type: Number, 
      required: true, 
      min: 1 
    },
    price: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    discount: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 100 
    },
    finalPrice: { 
      type: Number, 
      min: 0 
    },
    name: { 
      type: String,
      required: true 
    },
    image: { 
      type: String,
      required: true 
    },
    color: { 
      type: String,
      default: null 
    },
    size: { 
      type: String,
      default: null 
    },
    sku: { 
      type: String,
      default: null 
    }
  }],
  totalAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  paymentStatus: { 
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
    index: true
  },
  paymentMethod: { 
    type: String, 
    required: true 
  },
  transactionId: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  deliveryStatus: { 
    type: String,
    enum: Object.values(DeliveryStatus),
    default: DeliveryStatus.PENDING,
    index: true
  },
  shippingAddress: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true }
  },
  notes: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for common queries
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'items.sku': 1 });
orderSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate final prices and total amount
orderSchema.pre('save', function(next) {
  // Calculate final price for each item
  this.items.forEach(item => {
    const discount = item.discount || 0;
    item.finalPrice = item.price * (1 - discount / 100);
  });

  // Calculate total amount
  this.totalAmount = this.items.reduce(
    (total, item) => total + (item.finalPrice || item.price) * item.quantity,
    0
  );

  next();
});

// Method to populate product references
orderSchema.methods.populateProducts = async function() {
  return await this.populate({
    path: 'items.product',
    select: 'name images hasVariants variants'
  });
};

export const Order = model<IOrder>('Order', orderSchema);