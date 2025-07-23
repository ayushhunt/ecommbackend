import mongoose, { Document, Schema } from 'mongoose';

// Interface for Blog document
export interface IBlog extends Document {
  title: string;
  content: string;
  author: string;
  slug: string;
  tags: string[];
  published: boolean;
  featuredImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Blog Schema
const blogSchema = new Schema<IBlog>({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true
  },
  author: {
    type: String,
    required: [true, 'Author is required'],
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  published: {
    type: Boolean,
    default: false
  },
  featuredImage: {
    type: String,
    trim: true
  }
}, {
  timestamps: true // This automatically adds createdAt and updatedAt
});

// Create index for better search performance
blogSchema.index({ title: 'text', content: 'text' });
blogSchema.index({ slug: 1 });
blogSchema.index({ published: 1 });
blogSchema.index({ tags: 1 });

// Pre-save middleware to generate slug from title
blogSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }
  next();
});

// Export the model
export const Blog = mongoose.model<IBlog>('Blog', blogSchema);