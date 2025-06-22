import { Schema, model, Document, Types } from 'mongoose';

// Interface for media assets
interface IMediaAsset {
  url: string;
  alt?: string;
  type: 'image' | 'video' | '3d_model';
  size?: number; // File size in bytes
  format?: string; // e.g., 'jpg', 'mp4', 'glb'
  isMain?: boolean; // Main asset for the product
}

// Interface for product specifications
interface ISpecification {
  name: string;
  value: string;
  group?: string; // Group specifications (e.g., 'Technical', 'Physical')
}

// Interface for detailed description sections
interface IDescriptionSection {
  title: string;
  content: string;
  type: 'text' | 'html' | 'markdown';
  order: number;
}

// Interface for SEO data
interface ISEOData {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  slug?: string;
}

// Interface for shipping information
interface IShippingInfo {
  weight?: number; // in kg
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  freeShipping?: boolean;
  shippingClass?: string;
}

// Interface for product variants
interface IVariant {
  _id?: Types.ObjectId;
  color?: string;
  size?: string;
  sku: string;
  price?: number;
  stock: number;
  images?: string[];
  media?: IMediaAsset[]; // Enhanced media for variants
  isActive: boolean;
}

// Updated Product interface - Fixed the conflict by renaming 'model' to 'productModel'
export interface IProduct extends Document {
  name: string;
  description: string; // Keep basic description for backward compatibility
  
  // Enhanced description system
  detailedDescription?: IDescriptionSection[];
  shortDescription?: string;
  features?: string[]; // Key product features
  specifications?: ISpecification[]; // Technical specifications
  
  price: number;
  category: string;
  subCategory?: string; 
  childCategory?: string; 
  // Enhanced media system
  images: string[]; // Keep for backward compatibility
  media?: IMediaAsset[]; // New enhanced media system
  gallery?: {
    images?: IMediaAsset[];
    videos?: IMediaAsset[];
    models3D?: IMediaAsset[];
  };
  
  stock: number;
  ratings?: number;
  discount?: number;
  
  // Variant system
  hasVariants: boolean;
  variants?: IVariant[];
  availableColors?: string[];
  availableSizes?: string[];
  
  // New e-commerce features
  brand?: string;
  productModel?: string; // Changed from 'model' to 'productModel' to avoid conflict
  sku?: string; // Product SKU (different from variant SKU)
  barcode?: string;
  
  // Product status and visibility
  status: 'draft' | 'active' | 'inactive' | 'discontinued';
  featured?: boolean;
  isDigital?: boolean; // For digital products
  
  // Pricing and promotions
  comparePrice?: number; // Original price before discount
  costPrice?: number; // Cost price (for margin calculation)
  taxable?: boolean;
  taxClass?: string;
  
  // SEO and marketing
  seo?: ISEOData;
  tags?: string[];
  
  // Shipping and logistics
  shipping?: IShippingInfo;
  
  // Reviews and ratings
  reviewCount?: number;
  averageRating?: number;
  
  // Inventory management
  trackQuantity?: boolean;
  allowBackorders?: boolean;
  lowStockThreshold?: number;
  
  // Additional metadata
  vendor?: string;
  supplier?: string;
  manufacturingDate?: Date;
  expiryDate?: Date; // For products with expiry
  
  // Virtual properties - these are calculated fields
  totalStock?: number;
  finalPrice?: number;
  inStock?: boolean;
  lowStock?: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

// Media asset schema
const mediaAssetSchema = new Schema<IMediaAsset>({
  url: { type: String, required: true },
  alt: { type: String, trim: true },
  type: { type: String, enum: ['image', 'video', '3d_model'], required: true },
  size: { type: Number, min: 0 },
  format: { type: String, trim: true },
  isMain: { type: Boolean, default: false }
});

// Specification schema
const specificationSchema = new Schema<ISpecification>({
  name: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
  group: { type: String, trim: true }
});

// Description section schema
const descriptionSectionSchema = new Schema<IDescriptionSection>({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'html', 'markdown'], default: 'text' },
  order: { type: Number, required: true, default: 0 }
});

// SEO schema
const seoSchema = new Schema<ISEOData>({
  metaTitle: { type: String, trim: true, maxlength: 60 },
  metaDescription: { type: String, trim: true, maxlength: 160 },
  keywords: { type: [String], default: [] },
  slug: { type: String, trim: true, unique: true, sparse: true }
});

// Shipping info schema
const shippingInfoSchema = new Schema<IShippingInfo>({
  weight: { type: Number, min: 0 },
  dimensions: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  freeShipping: { type: Boolean, default: false },
  shippingClass: { type: String, trim: true }
});

// Enhanced variant schema
const variantSchema = new Schema<IVariant>({
  color: { type: String, trim: true },
  size: { type: String, trim: true },
  sku: { type: String, required: true },
  price: { type: Number, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  images: { type: [String], default: [] }, // Keep for backward compatibility
  media: { type: [mediaAssetSchema], default: [] }, // Enhanced media
  isActive: { type: Boolean, default: true }
});

// Enhanced product schema
const productSchema = new Schema<IProduct>({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  
  // Enhanced description system
  detailedDescription: { type: [descriptionSectionSchema], default: [] },
  shortDescription: { type: String, trim: true },
  features: { type: [String], default: [] },
  specifications: { type: [specificationSchema], default: [] },
  
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  category: { type: String, required: true },
  subCategory: { type: String, trim: true }, 
  childCategory: { type: String, trim: true }, 
  // Enhanced media system
  images: { type: [String], required: true }, // Keep for backward compatibility
  media: { type: [mediaAssetSchema], default: [] },
  gallery: {
    images: { type: [mediaAssetSchema], default: [] },
    videos: { type: [mediaAssetSchema], default: [] },
    models3D: { type: [mediaAssetSchema], default: [] }
  },
  
  stock: { type: Number, required: true, min: 0, default: 0 },
  ratings: { type: Number, default: 0, min: 0, max: 5 },
  
  // Variant system
  hasVariants: { type: Boolean, default: false },
  variants: { type: [variantSchema], default: [] },
  availableColors: { type: [String], default: [] },
  availableSizes: { type: [String], default: [] },
  
  // New e-commerce features
  brand: { type: String, trim: true },
  productModel: { type: String, trim: true }, // Changed from 'model'
  sku: { type: String, trim: true, unique: true, sparse: true },
  barcode: { type: String, trim: true },
  
  // Product status
  status: { 
    type: String, 
    enum: ['draft', 'active', 'inactive', 'discontinued'], 
    default: 'draft' 
  },
  featured: { type: Boolean, default: false },
  isDigital: { type: Boolean, default: false },
  
  // Pricing
  comparePrice: { type: Number, min: 0 },
  costPrice: { type: Number, min: 0 },
  taxable: { type: Boolean, default: true },
  taxClass: { type: String, trim: true },
  
  // SEO and marketing
  seo: { type: seoSchema },
  tags: { type: [String], default: [] },
  
  // Shipping
  shipping: { type: shippingInfoSchema },
  
  // Reviews
  reviewCount: { type: Number, default: 0, min: 0 },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  
  // Inventory
  trackQuantity: { type: Boolean, default: true },
  allowBackorders: { type: Boolean, default: false },
  lowStockThreshold: { type: Number, default: 5, min: 0 },
  
  // Additional metadata
  vendor: { type: String, trim: true },
  supplier: { type: String, trim: true },
  manufacturingDate: { type: Date },
  expiryDate: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
productSchema.index({ name: 'text', description: 'text', 'detailedDescription.content': 'text' });
productSchema.index({ 'variants.sku': 1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ 'seo.slug': 1 });
productSchema.index({ tags: 1 });
productSchema.index({ price: 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ createdAt: -1 });

// Virtual to calculate total stock from variants
productSchema.virtual('totalStock').get(function(this: IProduct) {
  if (this.hasVariants && this.variants && this.variants.length > 0) {
    return this.variants.reduce((total, variant) => total + variant.stock, 0);
  }
  return this.stock;
});

// Virtual to calculate final price after discount
productSchema.virtual('finalPrice').get(function(this: IProduct) {
  if (this.discount && this.discount > 0) {
    return this.price * (1 - this.discount / 100);
  }
  return this.price;
});

// Virtual to check if product is in stock
productSchema.virtual('inStock').get(function(this: IProduct) {
  const totalStock = this.hasVariants && this.variants && this.variants.length > 0
    ? this.variants.reduce((total, variant) => total + variant.stock, 0)
    : this.stock;
  return totalStock > 0;
});

// Virtual to check if stock is low
productSchema.virtual('lowStock').get(function(this: IProduct) {
  const totalStock = this.hasVariants && this.variants && this.variants.length > 0
    ? this.variants.reduce((total, variant) => total + variant.stock, 0)
    : this.stock;
  return totalStock <= (this.lowStockThreshold || 5);
});

// Pre-save middleware
productSchema.pre('save', function(next) {
  if (this.hasVariants && this.variants && this.variants.length > 0) {
    // Update total stock from variants
    this.stock = this.variants.reduce((total, variant) => total + variant.stock, 0);
    
    // Update available colors and sizes
    this.availableColors = [...new Set(this.variants.filter((v): v is IVariant & { color: string } => v.color !== undefined).map(v => v.color))];
    this.availableSizes = [...new Set(this.variants.filter((v): v is IVariant & { size: string } => v.size !== undefined).map(v => v.size))];
  }
  
  // Generate slug from name if not provided
  if (!this.seo?.slug && this.name) {
    const slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!this.seo) this.seo = {};
    this.seo.slug = slug;
  }
  
  next();
});

export const Product = model<IProduct>('Product', productSchema);
