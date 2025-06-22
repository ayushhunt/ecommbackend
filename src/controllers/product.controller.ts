import { Request, Response } from 'express';
import { Product, IProduct } from '../models/product';
import { Types } from 'mongoose';
import { generateSKU } from '../utils/skuGenerator';
import path from 'path';
import fs from 'fs';

const SERVER_IP = process.env.SERVER_IP || 'http://localhost:3000';
const UPLOAD_DIRECTORY = 'uploads/products';

// Helper function to determine file type
const getFileType = (mimetype: string, originalname: string): 'image' | 'video' | '3d_model' => {
  if (mimetype.startsWith('image/')) {
    return 'image';
  } else if (mimetype.startsWith('video/')) {
    return 'video';
  } else if (mimetype.startsWith('model/') ||
             mimetype === 'application/octet-stream' ||
             originalname.toLowerCase().endsWith('.glb') ||
             originalname.toLowerCase().endsWith('.gltf') ||
             originalname.toLowerCase().endsWith('.usdz') ||
             originalname.toLowerCase().endsWith('.obj') ||
             originalname.toLowerCase().endsWith('.fbx')) {
    return '3d_model';
  }
  return 'image'; // Default fallback
};

// Helper function to process uploaded files
const processUploadedFiles = (files: Express.Multer.File[]) => {
  const mediaAssets = files.map(file => {
    const fileType = getFileType(file.mimetype, file.originalname);
    const subDir = fileType === 'image' ? 'images' :
                   fileType === 'video' ? 'videos' : '3d-models';

    return {
      url: `${SERVER_IP}/${UPLOAD_DIRECTORY}/${subDir}/${file.filename}`,
      type: fileType,
      size: file.size,
      format: path.extname(file.originalname).substring(1),
      alt: file.originalname.split('.')[0] // Use filename without extension as alt
    };
  });

  // Separate media by type for gallery
  const gallery = {
    images: mediaAssets.filter(asset => asset.type === 'image'),
    videos: mediaAssets.filter(asset => asset.type === 'video'),
    models3D: mediaAssets.filter(asset => asset.type === '3d_model')
  };

  // Legacy images array (backward compatibility)
  const images = mediaAssets
    .filter(asset => asset.type === 'image')
    .map(asset => asset.url);

  return { mediaAssets, gallery, images };
};

// Helper function to parse JSON fields safely
const parseJSONField = (field: any, fieldName: string) => {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (error) {
      console.error(`Failed to parse JSON for field "${fieldName}":`, error);
      throw new Error(`Invalid ${fieldName} data format`);
    }
  }
  return field;
};


export const createProduct = async (req: Request, res: Response) => {
  try {
    const productData = req.body;
    // Parse complex JSON fields
    if (productData.detailedDescription) {
      productData.detailedDescription = parseJSONField(productData.detailedDescription, 'detailedDescription');
    }
    if (productData.features) {
      productData.features = parseJSONField(productData.features, 'features');
    }
    if (productData.specifications) {
      productData.specifications = parseJSONField(productData.specifications, 'specifications');
    }
    if (productData.seo) {
      productData.seo = parseJSONField(productData.seo, 'seo');
    }
    if (productData.tags) {
      productData.tags = parseJSONField(productData.tags, 'tags');
    }
    if (productData.shipping) {
      productData.shipping = parseJSONField(productData.shipping, 'shipping');
    }

    // Parse variants if they exist and hasVariants is true
    if (productData.hasVariants === 'true' || productData.hasVariants === true) {
      productData.hasVariants = true;
      if (productData.variants) {
        productData.variants = parseJSONField(productData.variants, 'variants');
      }
    } else {
      productData.hasVariants = false;
      productData.variants = [];
    }

    // Convert numeric strings to numbers
    const numericFields = ['price', 'discount', 'stock', 'comparePrice', 'costPrice', 'lowStockThreshold'];
    numericFields.forEach(field => {
      if (productData[field] !== undefined && productData[field] !== '') {
        productData[field] = Number(productData[field]);
      }
    });

    // Convert boolean strings to booleans
    const booleanFields = ['featured', 'isDigital', 'taxable', 'trackQuantity', 'allowBackorders'];
    booleanFields.forEach(field => {
      if (productData[field] === 'true') productData[field] = true;
      else if (productData[field] === 'false') productData[field] = false;
    });

    // Validate discount if provided
    if (productData.discount !== undefined) {
      if (productData.discount < 0 || productData.discount > 100) {
        res.status(400).json({
          success: false,
          message: 'Discount must be between 0 and 100'
        });
        return;
      }
    }

    // Handle variant data if hasVariants is true
    if (productData.hasVariants && Array.isArray(productData.variants)) {
      const variantsWithSKUs = await Promise.all(
        productData.variants.map(async (variant: any) => {
          if (typeof variant.stock !== 'number' || variant.stock < 0) {
            throw new Error('Each variant must have a non-negative stock value');
          }

          const sku = await generateSKU(
            productData.name,
            variant.color,
            variant.size
          );

          return {
            ...variant,
            sku,
            price: variant.price ? Number(variant.price) : undefined
          };
        })
      );

      productData.variants = variantsWithSKUs;
    } else if (productData.hasVariants && !Array.isArray(productData.variants)) {
      res.status(400).json({
        success: false,
        message: 'Variants array is required if hasVariants is true'
      });
      return;
    } else {
      if (typeof productData.stock !== 'number' || productData.stock < 0) {
        res.status(400).json({
          success: false,
          message: 'Stock is required and must be a non-negative number if hasVariants is false'
        });
        return;
      }
      productData.variants = [];
      productData.availableColors = [];
      productData.availableSizes = [];
    }


    // Handle uploaded media files
    if (req.files && Array.isArray(req.files) && req.files.length > 5) {
      const { mediaAssets, gallery, images } = processUploadedFiles(req.files as Express.Multer.File[]);

      // Set media data
      productData.media = mediaAssets;
      productData.gallery = gallery;
      productData.images = images.length > 0 ? images : ['placeholder-image.jpg']; // Ensure at least one image
    } else if (!productData.images || productData.images.length < 5) {
      res.status(400).json({
        success: false,
        message: 'At least Five image is required for the product'
      });
      return;
    }

    // Generate SKU if not provided
    // if (!productData.sku) {
    //   productData.sku = await generateSKU(productData.name);
    // }

    // Set default status if not provided
    if (!productData.status) {
      productData.status = 'draft';
    }

    const product = new Product(productData);
    const savedProduct = await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: savedProduct
    });
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};


// Get all products with enhanced filtering
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      category,
      subCategory,
      childCategory,
      brand,
      status,
      featured,
      isDigital,
      minPrice,
      maxPrice,
      minDiscount,
      maxDiscount,
      tags,
      rating,
      inStock,
      discount,
      sort = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 10,
      search
    } = req.query;

    // Build filter object
    const filter: any = {};

    // Category filtering (three-level hierarchy)
    if (category) filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    if (childCategory) filter.childCategory = childCategory;

    // Basic filters
    if (brand) filter.brand = brand;
    if (status) filter.status = status;
    if (featured !== undefined) filter.featured = featured === 'true';
    if (isDigital !== undefined) filter.isDigital = isDigital === 'true';

    // Price filtering
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Discount filtering
    if (minDiscount || maxDiscount) {
      filter.discount = {};
      if (minDiscount) filter.discount.$gte = Number(minDiscount);
      if (maxDiscount) filter.discount.$lte = Number(maxDiscount);
    }

    // Specific discount filter (for UI filter like "20% or more")
    if (discount) {
      filter.discount = { $gte: Number(discount) };
    }

    // Rating filtering
    if (rating) {
      filter.averageRating = { $gte: Number(rating) };
    }

    // Stock availability filtering
    if (inStock === 'true') {
      filter.$or = [
        // Products without variants
        { hasVariants: false, stock: { $gt: 0 } },
        // Products with variants having stock
        { 
          hasVariants: true,
          variants: { 
            $elemMatch: { 
              stock: { $gt: 0 },
              isActive: true 
            } 
          }
        }
      ];
    }

    // Tags filtering
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    // Text search (enhanced to include more fields)
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { shortDescription: searchRegex },
        { brand: searchRegex },
        { category: searchRegex },
        { subCategory: searchRegex },
        { childCategory: searchRegex },
        { tags: { $in: [searchRegex] } },
        { 'specifications.name': searchRegex },
        { 'specifications.value': searchRegex },
        { features: { $in: [searchRegex] } }
      ];
    }

    // Build sort object
    const sortOptions: any = {};
    
    // Handle different sort options
    switch (sort) {
      case 'price':
        sortOptions.price = order === 'asc' ? 1 : -1;
        break;
      case 'name':
        sortOptions.name = order === 'asc' ? 1 : -1;
        break;
      case 'rating':
        sortOptions.averageRating = order === 'asc' ? 1 : -1;
        break;
      case 'discount':
        sortOptions.discount = order === 'asc' ? 1 : -1;
        break;
      case 'featured':
        sortOptions.featured = -1; // Featured products first
        sortOptions.createdAt = -1; // Then by newest
        break;
      case 'popularity':
        sortOptions.reviewCount = -1;
        sortOptions.averageRating = -1;
        break;
      default:
        sortOptions[sort as string] = order === 'asc' ? 1 : -1;
    }

    // Calculate pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with aggregation pipeline for better performance
    const pipeline = [
      { $match: filter },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limitNum },
      {
        $addFields: {
          // Calculate final price after discount
          finalPrice: {
            $cond: {
              if: { $and: [{ $gt: ["$discount", 0] }, { $lte: ["$discount", 100] }] },
              then: { $multiply: ["$price", { $subtract: [1, { $divide: ["$discount", 100] }] }] },
              else: "$price"
            }
          },
          // Calculate total stock for variants
          totalStock: {
            $cond: {
              if: "$hasVariants",
              then: { $sum: "$variants.stock" },
              else: "$stock"
            }
          },
          // Check if product is in stock
          isInStock: {
            $cond: {
              if: "$hasVariants",
              then: { $gt: [{ $sum: "$variants.stock" }, 0] },
              else: { $gt: ["$stock", 0] }
            }
          }
        }
      }
    ];

    // Execute aggregation
    const products = await Product.aggregate(pipeline);
    
    // Get total count for pagination
    const countPipeline = [
      { $match: filter },
      { $count: "total" }
    ];
    
    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult.length > 0 ? countResult[0].total : 0;

    // Get category statistics for additional info
    const categoryStats = await Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            category: "$category",
            subCategory: "$subCategory",
            childCategory: "$childCategory"
          },
          count: { $sum: 1 },
          avgPrice: { $avg: "$price" },
          maxPrice: { $max: "$price" },
          minPrice: { $min: "$price" }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Products retrieved successfully',
      data: products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        totalItems: totalProducts,
        limit: limitNum,
        hasNextPage: pageNum < Math.ceil(totalProducts / limitNum),
        hasPrevPage: pageNum > 1
      },
      filters: {
        applied: {
          category,
          subCategory,
          childCategory,
          brand,
          status,
          featured,
          isDigital,
          minPrice,
          maxPrice,
          minDiscount,
          maxDiscount,
          rating,
          inStock,
          discount,
          tags,
          search
        },
        categoryStats: categoryStats.length > 0 ? categoryStats : undefined
      }
    });
  } catch (error: any) {
    console.error('Error getting products:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve products',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

// Get a single product by ID
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`Fetching product with ID: ${id}`);
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
  } catch (error: any) {
    console.error('Error getting product by ID:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve product',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
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

    // Parse removal arrays from JSON strings
    let mediaToRemove: string[] = [];
    let galleryImagesToRemove: string[] = [];
    let galleryVideosToRemove: string[] = [];
    let galleryModelsToRemove: string[] = [];

    try {
      mediaToRemove = updateData.mediaToRemove ? 
        (typeof updateData.mediaToRemove === 'string' ? 
          JSON.parse(updateData.mediaToRemove) : updateData.mediaToRemove) : [];
      
      galleryImagesToRemove = updateData.galleryImagesToRemove ? 
        (typeof updateData.galleryImagesToRemove === 'string' ? 
          JSON.parse(updateData.galleryImagesToRemove) : updateData.galleryImagesToRemove) : [];
      
      galleryVideosToRemove = updateData.galleryVideosToRemove ? 
        (typeof updateData.galleryVideosToRemove === 'string' ? 
          JSON.parse(updateData.galleryVideosToRemove) : updateData.galleryVideosToRemove) : [];
      
      galleryModelsToRemove = updateData.galleryModelsToRemove ? 
        (typeof updateData.galleryModelsToRemove === 'string' ? 
          JSON.parse(updateData.galleryModelsToRemove) : updateData.galleryModelsToRemove) : [];
    } catch (parseError) {
      console.error('Error parsing removal arrays:', parseError);
      res.status(400).json({
        success: false,
        message: 'Invalid removal data format'
      });
      return;
    }

    // Helper function to safely remove files
    const unlinkFile = (fileUrl: string) => {
      try {
        // Extract the relative path from the URL
        const urlParts = fileUrl.split('/');
        const uploadsIndex = urlParts.findIndex(part => part === 'uploads');
        
        if (uploadsIndex !== -1) {
          const relativePath = urlParts.slice(uploadsIndex).join('/');
          const absolutePath = path.join(process.cwd(), relativePath);
          
          fs.unlink(absolutePath, (err) => {
            if (err && err.code !== 'ENOENT') {
              console.error('Failed to delete file:', absolutePath, err);
            } else {
              console.log('Successfully deleted file:', absolutePath);
            }
          });
        } else {
          console.warn('Could not extract file path from URL:', fileUrl);
        }
      } catch (error) {
        console.error('Error processing file URL for deletion:', fileUrl, error);
      }
    };

    // Helper function to get URL from media item
    const getMediaUrl = (mediaItem: any): string => {
      if (typeof mediaItem === 'string') return mediaItem;
      return mediaItem?.url || mediaItem;
    };

    // Remove legacy media files
    if (Array.isArray(mediaToRemove) && mediaToRemove.length > 0) {
      mediaToRemove.forEach(unlinkFile);
      product.media = (product.media || []).filter(m => {
        const url = getMediaUrl(m);
        return !mediaToRemove.includes(url);
      });
    }

    // Initialize gallery if it doesn't exist
    if (!product.gallery) {
      product.gallery = { images: [], videos: [], models3D: [] };
    }

    // Remove gallery images
    if (Array.isArray(galleryImagesToRemove) && galleryImagesToRemove.length > 0) {
      galleryImagesToRemove.forEach(unlinkFile);
      product.gallery.images = (product.gallery.images || []).filter(img => {
        const url = getMediaUrl(img);
        return !galleryImagesToRemove.includes(url);
      });
    }

    // Remove gallery videos
    if (Array.isArray(galleryVideosToRemove) && galleryVideosToRemove.length > 0) {
      galleryVideosToRemove.forEach(unlinkFile);
      product.gallery.videos = (product.gallery.videos || []).filter(v => {
        const url = getMediaUrl(v);
        return !galleryVideosToRemove.includes(url);
      });
    }

    // Remove gallery 3D models
    if (Array.isArray(galleryModelsToRemove) && galleryModelsToRemove.length > 0) {
      galleryModelsToRemove.forEach(unlinkFile);
      product.gallery.models3D = (product.gallery.models3D || []).filter(m => {
        const url = getMediaUrl(m);
        return !galleryModelsToRemove.includes(url);
      });
    }

    // Handle newly uploaded files
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const { mediaAssets, gallery, images } = processUploadedFiles(req.files as Express.Multer.File[]);
      
      // Add new media to existing arrays
      product.media = [...(product.media || []), ...mediaAssets];
      product.gallery = {
        images: [...(product.gallery.images || []), ...gallery.images],
        videos: [...(product.gallery.videos || []), ...gallery.videos],
        models3D: [...(product.gallery.models3D || []), ...gallery.models3D]
      };
      
      // Update legacy images array
      if (product.images) {
        product.images = [...product.images, ...images];
      } else {
        product.images = images;
      }
    }

    // Parse complex JSON fields (excluding the removal arrays we already handled)
    const jsonFields = ['detailedDescription', 'features', 'specifications', 'seo', 'tags', 'shipping', 'variants'];
    jsonFields.forEach(field => {
      if (updateData[field]) {
        updateData[field] = parseJSONField(updateData[field], field);
      }
    });

    // Handle variants
    if (updateData.hasVariants !== undefined) {
      updateData.hasVariants = updateData.hasVariants === 'true' || updateData.hasVariants === true;

      if (updateData.hasVariants && updateData.variants) {
        if (!Array.isArray(updateData.variants)) {
          res.status(400).json({
            success: false,
            message: 'Variants must be an array when hasVariants is true'
          });
          return;
        }
      } else if (updateData.hasVariants) {
        updateData.variants = [];
      }
    }

    // Convert numeric strings to numbers
    const numericFields = ['price', 'discount', 'stock', 'comparePrice', 'costPrice', 'lowStockThreshold'];
    numericFields.forEach(field => {
      if (updateData[field] !== undefined && updateData[field] !== '') {
        updateData[field] = Number(updateData[field]);
      }
    });

    // Convert boolean strings to booleans
    const booleanFields = ['featured', 'isDigital', 'taxable', 'trackQuantity', 'allowBackorders'];
    booleanFields.forEach(field => {
      if (updateData[field] === 'true') updateData[field] = true;
      else if (updateData[field] === 'false') updateData[field] = false;
    });

    // Validate discount
    if (updateData.discount !== undefined) {
      if (updateData.discount < 0 || updateData.discount > 100) {
        res.status(400).json({
          success: false,
          message: 'Discount must be between 0 and 100'
        });
        return;
      }
    }

    // Handle variants update
    if (updateData.hasVariants) {
      if (updateData.variants && Array.isArray(updateData.variants)) {
        const existingSkuMap = new Map(
          product.variants?.map(v => [v._id?.toString(), v.sku]) || []
        );

        try {
          updateData.variants = await Promise.all(
            updateData.variants.map(async (v: any) => {
              if (typeof v.stock !== 'number' || v.stock < 0) {
                throw new Error('Each variant must have a non-negative stock value');
              }

              // Use existing SKU if variant has an _id and it matches an existing one
              const sku = (v._id && existingSkuMap.has(v._id.toString()))
                ? existingSkuMap.get(v._id.toString())
                : await generateSKU(product.name, v.color, v.size);

              return {
                ...v,
                sku,
                _id: v._id ? new Types.ObjectId(v._id) : new Types.ObjectId(),
                price: v.price ? Number(v.price) : undefined
              };
            })
          );
        } catch (variantError: any) {
          res.status(400).json({
            success: false,
            message: variantError.message || 'Invalid variant data'
          });
          return;
        }
      }
    } else {
      updateData.variants = [];
      updateData.availableColors = [];
      updateData.availableSizes = [];
      
      // Validate stock for non-variant product
      if (updateData.stock !== undefined && (typeof updateData.stock !== 'number' || updateData.stock < 0)) {
        res.status(400).json({
          success: false,
          message: 'Stock must be a non-negative number when hasVariants is false'
        });
        return;
      }
    }

    // Remove processed fields from updateData
    delete updateData.mediaToRemove;
    delete updateData.galleryImagesToRemove;
    delete updateData.galleryVideosToRemove;
    delete updateData.galleryModelsToRemove;
    delete updateData._id;

    // Apply updates to the product document
    Object.keys(updateData).forEach(key => {
      // Skip media and gallery since we handled them separately
      if (!['media', 'gallery', 'images'].includes(key)) {
        (product as any)[key] = updateData[key];
      }
    });

    // Save the updated product
    const updatedProduct = await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });

  } catch (error: any) {
    console.error('Error updating product:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val: any) => val.message);
      res.status(400).json({
        success: false,
        message: 'Validation Error: ' + messages.join(', '),
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update product',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
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
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete product',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};


