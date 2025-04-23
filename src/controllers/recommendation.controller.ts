import { Request, Response } from 'express';
import recommendationService from '../services/recommendationService';

export const getRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id; // Will be undefined for non-authenticated users
    const { limit = 10, category, productId } = req.query;
    
    const options = {
      limit: parseInt(limit as string),
      category: category as string,
      productId: productId as string,
      userId
    };
    
    const recommendations = await recommendationService.getPersonalizedRecommendations(options);
    
    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });
  } catch (error:any) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve recommendations',
      error: error.message
    });
  }
};

export const getSimilarProducts = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { limit = 8 } = req.query;
    
    if (!productId) {
      res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
      return;
    }
    
    const similarProducts = await recommendationService.getSimilarProducts(
      productId,
      { limit: parseInt(limit as string) }
    );
    
    res.status(200).json({
      success: true,
      count: similarProducts.length,
      data: similarProducts
    });
  } catch (error:any) {
    console.error('Error getting similar products:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve similar products',
      error: error.message
    });
  }
};

export const getCategoryRecommendations = async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { limit = 10 } = req.query;
    
    if (!category) {
      res.status(400).json({
        success: false,
        message: 'Category is required'
      });
      return;
    }
    
    const recommendations = await recommendationService.getCategoryRecommendations(
      category,
      { limit: parseInt(limit as string) }
    );
    
    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });
  } catch (error:any) {
    console.error('Error getting category recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve category recommendations',
      error: error.message
    });
  }
};

export const getBestSellers = async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    
    const bestSellers = await recommendationService.getBestSellers({
      limit: parseInt(limit as string)
    });
    
    res.status(200).json({
      success: true,
      count: bestSellers.length,
      data: bestSellers
    });
  } catch (error:any) {
    console.error('Error getting best sellers:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve best sellers',
      error: error.message
    });
  }
};

export const getTrendingProducts = async (req: Request, res: Response) => {
  try {
    const { limit = 10 } = req.query;
    
    const trendingProducts = await recommendationService.getTrendingProducts({
      limit: parseInt(limit as string)
    });
    
    res.status(200).json({
      success: true,
      count: trendingProducts.length,
      data: trendingProducts
    });
  } catch (error:any) {
    console.error('Error getting trending products:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve trending products',
      error: error.message
    });
  }
};

export const getRelatedProducts = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;
    const { limit = 8 } = req.query;
    
    // If productId is provided, get similar products
    if (productId) {
      const similarProducts = await recommendationService.getSimilarProducts(
        productId,
        { limit: parseInt(limit as string) }
      );
      
      res.status(200).json({
        success: true,
        count: similarProducts.length,
        data: similarProducts
      });
      return;
    }
    
    // Otherwise, get personalized recommendations
    const recommendations = await recommendationService.getPersonalizedRecommendations({
      userId,
      limit: parseInt(limit as string)
    });
    
    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });
  } catch (error:any) {
    console.error('Error getting related products:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve related products',
      error: error.message
    });
  }
};