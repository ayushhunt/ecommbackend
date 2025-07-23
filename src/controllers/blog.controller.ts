import { Request, Response } from 'express';
import { Blog, IBlog } from '../models/blog';
import path from 'path';

const SERVER_IP = process.env.SERVER_IP || 'http://localhost:3000';
const BLOG_UPLOAD_DIRECTORY = 'uploads/blogs';

// Get all blogs (with pagination and filtering)
export const getAllBlogs = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Filter options
    const filter: any = {};
    
    // Only show published blogs for public access (add ?showAll=true for admin)
    if (req.query.showAll !== 'true') {
      filter.published = true;
    }
    
    // Filter by tags
    if (req.query.tags) {
      const tags = (req.query.tags as string).split(',');
      filter.tags = { $in: tags };
    }
    
    // Search functionality
    if (req.query.search) {
      filter.$text = { $search: req.query.search as string };
    }

    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    const total = await Blog.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: blogs,
      pagination: {
        currentPage: page,
        totalPages,
        totalBlogs: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blogs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get single blog by slug
export const getBlogBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    
    const blog = await Blog.findOne({ slug }).select('-__v');
    
    if (!blog) {
      res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
      return;
    }

    // Only show published blogs unless admin
    if (!blog.published && req.query.preview !== 'true') {
      res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get single blog by ID
export const getBlogById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id).select('-__v');
    
    if (!blog) {
      res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Create new blog
export const createBlog = async (req: Request, res: Response) => {
  try {
    const blogData = req.body;
    const files = req.files as Express.Multer.File[];

    // Process uploaded images
    if (files && files.length > 0) {
      const images = files.map(file => ({
        url: `${SERVER_IP}/${BLOG_UPLOAD_DIRECTORY}/images/${file.filename}`,
        alt: file.originalname.split('.')[0],
        size: file.size,
        format: path.extname(file.originalname).substring(1)
      }));

      blogData.images = images;

      // Set first image as featured image if not provided
      if (!blogData.featuredImage) {
        blogData.featuredImage = images[0].url;
      }
    }

    // Parse tags if it's a string (from form data)
    if (typeof blogData.tags === 'string') {
      try {
        blogData.tags = JSON.parse(blogData.tags);
      } catch {
        blogData.tags = blogData.tags.split(',').map((tag: string) => tag.trim());
      }
    }

    // Parse published status
    if (typeof blogData.published === 'string') {
      blogData.published = blogData.published === 'true';
    }

    const blog = new Blog(blogData);
    const savedBlog = await blog.save();

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: savedBlog
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof Error && error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
      return;
    }

    // Handle duplicate slug error
    if (error instanceof Error && error.message.includes('duplicate key')) {
      res.status(400).json({
        success: false,
        message: 'Blog with this title already exists'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error creating blog',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update blog
export const updateBlog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const blog = await Blog.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true,
        runValidators: true
      }
    ).select('-__v');
    
    if (!blog) {
      res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof Error && error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating blog',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete blog
export const deleteBlog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findByIdAndDelete(id);
    
    if (!blog) {
      res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting blog',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Toggle blog publish status
export const togglePublishStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id);
    
    if (!blog) {
      res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
      return;
    }
    
    blog.published = !blog.published;
    await blog.save();
    
    res.status(200).json({
      success: true,
      message: `Blog ${blog.published ? 'published' : 'unpublished'} successfully`,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating blog status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get blogs by tag
export const getBlogsByTag = async (req: Request, res: Response) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    const blogs = await Blog.find({ 
      tags: tag,
      published: true 
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');
    
    const total = await Blog.countDocuments({ tags: tag, published: true });
    const totalPages = Math.ceil(total / limit);
    
    res.status(200).json({
      success: true,
      data: blogs,
      pagination: {
        currentPage: page,
        totalPages,
        totalBlogs: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blogs by tag',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};