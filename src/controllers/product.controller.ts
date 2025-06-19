import { Request, Response } from 'express';
import { Product, IProduct } from '../models/product';
import { Types } from 'mongoose';
import { generateSKU } from '../utils/skuGenerator';
import path from 'path';

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
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const { mediaAssets, gallery, images } = processUploadedFiles(req.files as Express.Multer.File[]);

      // Set media data
      productData.media = mediaAssets;
      productData.gallery = gallery;
      productData.images = images.length > 0 ? images : ['placeholder-image.jpg']; // Ensure at least one image
    } else if (!productData.images || productData.images.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one image is required for the product'
      });
      return;
    }

    // Generate SKU if not provided
    if (!productData.sku) {
      productData.sku = await generateSKU(productData.name);
    }

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
      brand,
      status,
      featured,
      isDigital,
      minPrice,
      maxPrice,
      minDiscount,
      maxDiscount,
      tags,
      sort = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 10,
      search
    } = req.query;

    // Build filter object
    const filter: any = {};

    if (category) filter.category = category;
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

    // Tags filtering
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    // Text search
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

    // Parse complex JSON fields, INCLUDING media and gallery
    const jsonFields = ['detailedDescription', 'features', 'specifications', 'seo', 'tags', 'shipping', 'media', 'gallery'];
    jsonFields.forEach(field => {
      if (updateData[field]) {
        updateData[field] = parseJSONField(updateData[field], field);
      }
    });

    // Handle variants
    if (updateData.hasVariants !== undefined) {
      updateData.hasVariants = updateData.hasVariants === 'true' || updateData.hasVariants === true;

      if (updateData.hasVariants && updateData.variants) {
        updateData.variants = parseJSONField(updateData.variants, 'variants');
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

    // Handle new media uploads
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const { mediaAssets, gallery, images } = processUploadedFiles(req.files as Express.Multer.File[]);

      // Merge with existing media or replace
      // The frontend now sends the *current* state of existing media + new media in the 'media' and 'gallery' fields
      // So we just need to add the newly uploaded files to the lists received from the frontend.
      // The frontend is responsible for sending the list of existing media that should *remain*.
      updateData.media = [...(updateData.media || []), ...mediaAssets];
      updateData.gallery = {
          images: [...(updateData.gallery?.images || []), ...gallery.images],
          videos: [...(updateData.gallery?.videos || []), ...gallery.videos],
          models3D: [...(updateData.gallery?.models3D || []), ...gallery.models3D]
      };
      updateData.images = [...(updateData.images || []), ...images]; // Update legacy images array too
    } else {
        // If no new files are uploaded, ensure media/gallery/images are still parsed if sent
        // This is already handled by the jsonFields parsing above.
        // Ensure images array is not empty if no new images and no existing images were sent
         if (!updateData.images || updateData.images.length === 0) {
             // This case might happen if all existing images were removed and no new ones added
             // You might want to enforce at least one image or handle this case specifically
             // For now, let's allow empty if the frontend explicitly sends an empty array
             // but log a warning or handle it based on your schema requirements.
             console.warn(`Product ${id} updated with no images.`);
         }
    }


    // Handle variants update
    if (updateData.hasVariants) {
      if (updateData.variants && Array.isArray(updateData.variants)) {
        const existingSkuMap = new Map(
          product.variants?.map(v => [v._id?.toString(), v.sku]) || []
        );

        updateData.variants = await Promise.all(
          updateData.variants.map(async (v: any) => {
            if (typeof v.stock !== 'number' || v.stock < 0) {
              res.status(400).json({
                success: false,
                message: 'Each variant must have a non-negative stock value'
              });
              throw new Error('Invalid variant stock'); // Throw to stop processing
            }

            // Use existing SKU if variant has an _id and it matches an existing one
            const sku = (v._id && existingSkuMap.has(v._id.toString()))
              ? existingSkuMap.get(v._id.toString())
              : await generateSKU(product.name, v.color, v.size); // Generate new SKU for new variants

            return {
              ...v,
              sku,
              _id: v._id ? new Types.ObjectId(v._id) : new Types.ObjectId(), // Ensure _id is ObjectId
              price: v.price ? Number(v.price) : undefined
            };
          })
        );
      } else if (updateData.hasVariants && !Array.isArray(updateData.variants)) {
         res.status(400).json({
           success: false,
           message: 'Variants array is required if hasVariants is true'
         });
         return;
      }
    } else {
      updateData.variants = [];
      updateData.availableColors = []; // Clear variant-specific fields
      updateData.availableSizes = [];
      // Validate stock for non-variant product
      if (updateData.stock !== undefined && (typeof updateData.stock !== 'number' || updateData.stock < 0)) {
        res.status(400).json({
          success: false,
          message: 'Stock must be a non-negative number if hasVariants is false'
        });
        return;
      }
    }

    // Update the product
    // Using Object.assign might overwrite fields you didn't intend to if updateData is missing them.
    // A safer approach is to explicitly update fields or use findByIdAndUpdate with $set.
    // Let's use findByIdAndUpdate for clarity and to handle potential partial updates better.

    // Remove _id from updateData as it's in the params
    delete updateData._id;

    const updatedProduct = await Product.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });

    if (!updatedProduct) {
         // Should not happen if product was found initially, but good practice
         res.status(404).json({
             success: false,
             message: 'Product not found after update attempt'
         });
         return;
    }


    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error: any) {
    console.error('Error updating product:', error);
    // Check for Mongoose validation errors specifically
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((val: any) => val.message);
        res.status(400).json({
            success: false,
            message: 'Validation Error: ' + messages.join(', '),
            error: process.env.NODE_ENV === 'development' ? error : undefined
        });
    } else {
        res.status(400).json({ // Use 400 for client errors like invalid data format
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


