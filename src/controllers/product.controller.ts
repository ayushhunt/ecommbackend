import { Request, Response } from 'express';
import { Product } from '../models/product';

// Create a new product
export const createProduct = async (req: Request, res: Response)=> {
  try {
    const productData = req.body;
    
    const UPLOAD_DIRECTORY = 'uploads/products';
    
    // For multiple images (when using upload.array in routes)
    if (req.files && Array.isArray(req.files)) {
      productData.images = (req.files as Express.Multer.File[]).map(file => {
        return `/${UPLOAD_DIRECTORY}/${file.filename}`;
      });
    } 
    // For single image (when using upload.single in routes)
    else if (req.file) {
      productData.images = [`/${UPLOAD_DIRECTORY}/${req.file.filename}`];
    }

    const product = new Product(productData);
    const savedProduct = await product.save();
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: savedProduct
    });
    return;
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create product',
      error: error
    });
    return;
  }
};

// Get all products with optional filtering
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { 
      category, 
      minPrice, 
      maxPrice, 
      sort = 'createdAt', 
      order = 'desc',
      page = 1,
      limit = 10,
      search
    } = req.query;
    
    // Build filter object
    const filter: any = {};
    
    if (category) {
      filter.category = category;
    }
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    
    // Add text search if provided
    if (search) {
      filter.$text = { $search: search as string };
    }
    
    // Build sort object
    const sortOptions: any = {};
    sortOptions[sort as string] = order === 'asc' ? 1 : -1;
    
    // Calculate pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Execute query
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);
    
    const totalProducts = await Product.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Products retrieved successfully',
      data: products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        totalItems: totalProducts,
        limit: limitNum
      }
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve products',
      error: error
    });
    return;
  }
};

// Get a single product by ID
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Product retrieved successfully',
      data: product
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve product',
      error: error
    });
    return;
  }
};

// Update a product by ID
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const product = await Product.findById(id);
    
    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }
    
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
    return;
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update product',
      error: error
    });
    return;
  }
};

// Delete a product by ID
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }
    
    await Product.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      data: product
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete product',
      error: error
    });
    return;
  }
};