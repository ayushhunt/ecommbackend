import { Request, Response } from 'express';
import { Review } from '../models/review';
import { Product } from '../models/product';
import mongoose from 'mongoose';

// ===== USER ENDPOINTS =====

// Create a review
export const createReview = async (req: Request, res: Response)=> {
  try {
    const { productId, rating, comment } = req.body;
    const userId = req.user.id;

    // Convert string UUID to string for MongoDB
    const userIdString = userId.toString();
    
    // Check if user has already reviewed this product
    const existingReview = await Review.findOne({
      product: productId,
      user: userIdString
    });

    if (existingReview) {
       res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
      return;
    }

    // Create new review
    const review = new Review({
      user: userIdString,
      product: productId,
      rating: rating,
      comment: comment
    });

    await review.save();

    // Update product rating
    await updateProductRating(productId);

    //  populated review
    const populatedReview = await Review.findById(review._id)
      .populate('product', 'name images')
      .populate('user', 'name'); // Assuming user has a name field

     res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: populatedReview
    });
  } catch (error: any) {
     res.status(400).json({
      success: false,
      message: error.message || 'Failed to create review',
      error: error
    });
  }
};

// Get user's reviews
export const getUserReviews = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const reviews = await Review.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('product', 'name images price');
    
    const totalReviews = await Review.countDocuments({ user: userId });
    
     res.status(200).json({
      success: true,
      message: 'Reviews retrieved successfully',
      data: reviews,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalItems: totalReviews,
        limit: limitNum
      }
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve reviews',
      error: error
    });
  }
};

// Update a review
export const updateReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;
    
    const review = await Review.findById(id);
    
    if (!review) {
       res.status(404).json({
        success: false,
        message: 'Review not found'
      });
      return;
    }
    
    // Check if the review belongs to the user
    if (review.user.toString() !== userId.toString()) {
       res.status(403).json({
        success: false,
        message: 'You are not authorized to update this review'
      });
    }
    
    // Update review
    review.rating = rating || review.rating;
    review.comment = comment || review.comment;
    
    await review.save();
    
    // Update product rating
    await updateProductRating(review.product.toString());
    
     res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });
  } catch (error: any) {
     res.status(400).json({
      success: false,
      message: error.message || 'Failed to update review',
      error: error
    });
  }
};

// Delete a review
export const deleteReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const review = await Review.findById(id);
    
    if (!review) {
       res.status(404).json({
        success: false,
        message: 'Review not found'
      });
      return;
    }
    
    // Check if the review belongs to the user
    if (review.user.toString() !== userId.toString()) {
       res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this review'
      });
    }
    
    const productId = review.product;
    
    await Review.findByIdAndDelete(id);
    
    // Update product rating
    await updateProductRating(productId.toString());
    
     res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete review',
      error: error
    });
  }
};

// ===== PUBLIC ENDPOINTS =====

// Get reviews for a product
export const getProductReviews = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'createdAt', order = 'desc' } = req.query;
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build sort object
    const sortOptions: any = {};
    sortOptions[sort as string] = order === 'asc' ? 1 : -1;
    
    const reviews = await Review.find({ product: productId })
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
     ; // Assuming user has a name field
    
    const totalReviews = await Review.countDocuments({ product: productId });
    
    // Calculate stats
    const stats = await Review.aggregate([
      { $match: { product: productId } },
      { $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
        ratingsDistribution: {
          $push: '$rating'
        }
      }}
    ]);
    
    // Process ratings distribution
    let ratingsDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    if (stats.length > 0 && stats[0].ratingsDistribution) {
      stats[0].ratingsDistribution.forEach((rating: number) => {
        ratingsDistribution[rating as keyof typeof ratingsDistribution]++;
      });
    }
    
     res.status(200).json({
      success: true,
      message: 'Reviews retrieved successfully',
      data: reviews,
      stats: {
        avgRating: stats.length > 0 ? parseFloat(stats[0].avgRating.toFixed(1)) : 0,
        reviewCount: totalReviews,
        ratingsDistribution
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalItems: totalReviews,
        limit: limitNum
      }
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve reviews',
      error: error
    });
  }
};

// ===== ADMIN ENDPOINTS =====

// Get all reviews (admin)
export const getAllReviews = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      productId, 
      userId,
      minRating,
      maxRating,
      sort = 'createdAt',
      order = 'desc'
    } = req.query;
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter
    const filter: any = {};
    
    if (productId) {
      filter.product = productId;
    }
    
    if (userId) {
      filter.user = userId;
    }
    
    if (minRating || maxRating) {
      filter.rating = {};
      if (minRating) filter.rating.$gte = Number(minRating);
      if (maxRating) filter.rating.$lte = Number(maxRating);
    }
    
    // Build sort object
    const sortOptions: any = {};
    sortOptions[sort as string] = order === 'asc' ? 1 : -1;
    
    const reviews = await Review.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .populate('product', 'name images');
    
    const totalReviews = await Review.countDocuments(filter);
    
     res.status(200).json({
      success: true,
      message: 'Reviews retrieved successfully',
      data: reviews,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalItems: totalReviews,
        limit: limitNum
      }
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve reviews',
      error: error
    });
  }
};

// Delete a review (admin)
export const adminDeleteReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const review = await Review.findById(id);
    
    if (!review) {
       res.status(404).json({
        success: false,
        message: 'Review not found'
      });
      return;
    }
    
    const productId = review.product;
    
    await Review.findByIdAndDelete(id);
    
    // Update product rating
    await updateProductRating(productId.toString());
    
     res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error: any) {
     res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete review',
      error: error
    });
  }
};

// ===== HELPER FUNCTIONS =====

// Update product rating based on reviews
const updateProductRating = async (productId: string) => {
  const stats = await Review.aggregate([
    { $match: { product: productId } },
    { $group: {
      _id: null,
      avgRating: { $avg: '$rating' },
      reviewCount: { $sum: 1 }
    }}
  ]);
  
  const avgRating = stats.length > 0 ? parseFloat(stats[0].avgRating.toFixed(1)) : 0;
  
  await Product.findByIdAndUpdate(productId, { ratings: avgRating });
};