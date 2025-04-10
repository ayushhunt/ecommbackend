// src/services/recommendationService.ts


import {Product} from '../models/product';
import {Order} from '../models/order';
import Wishlist from '../models/wishlist';
import {Cart} from '../models/cart';




interface RecommendationOptions {
  userId?: string;
  productId?: string;
  category?: string;
  limit?: number;
}

export class RecommendationService {
  /**
   * Get recommendations based on user activity when logged in
   */
  async getUserBasedRecommendations(
    userId: string,
    options: RecommendationOptions = {}
  ) {
    const limit = options.limit || 10;
    
    try {
      // Get user's purchase history
      const orders = await Order.find({ userId }).sort({ createdAt: -1 });
      
      // Get user's wishlist
      const wishlist = await Wishlist.findOne({ userId });
      
      // Get user's cart
      const cart = await Cart.findOne({ userId });
      
      // Extract product ids and categories from user's history
      const purchasedProductIds = orders.flatMap(order => 
        order.items.map(item => item.product)
      );
      
      const wishlistProductIds = wishlist ? wishlist.items.map(item => item.productId) : [];
      const cartProductIds = cart ? cart.items.map(item => item.productId) : [];
      
      // Get all products to extract categories
      const userProducts = await Product.find({
        _id: { $in: [...purchasedProductIds, ...wishlistProductIds, ...cartProductIds] }
      });
      
      // Extract categories from user's products
      const categories = userProducts.map(product => product.category);
      const uniqueCategories = [...new Set(categories)];
      
      // Find recommendations based on categories user has shown interest in
      const recommendations = await Product.find({
        _id: { $nin: [...purchasedProductIds, ...wishlistProductIds, ...cartProductIds] },
        category: { $in: uniqueCategories },
        stock: { $gt: 0 } // Only recommend in-stock products
      })
        .sort({ averageRating: -1 })
        .limit(limit);
      
      if (recommendations.length < limit) {
        // If we don't have enough category-based recommendations,
        // get the top-rated products the user hasn't interacted with
        const remainingNeeded = limit - recommendations.length;
        const extraRecommendations = await Product.find({
          _id: { 
            $nin: [...purchasedProductIds, ...wishlistProductIds, ...cartProductIds, 
                  ...recommendations.map(p => p._id)]
          },
          stock: { $gt: 0 }
        })
          .sort({ averageRating: -1 })
          .limit(remainingNeeded);
        
        recommendations.push(...extraRecommendations);
      }
      
      return recommendations;
    } catch (error) {
      console.error('Error getting user-based recommendations:', error);
      // If user-based recommendations fail, fall back to general recommendations
      return this.getGeneralRecommendations({ limit });
    }
  }
  
  /**
   * Get similar products based on a specific product
   */
  async getSimilarProducts(productId: string, options: RecommendationOptions = {}) {
    const limit = options.limit || 8;
    
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        throw new Error('Product not found');
      }
      
      // Find products in the same category
      const similarProducts = await Product.find({
        _id: { $ne: productId },
        category: product.category,
        stock: { $gt: 0 }
      })
        .sort({ averageRating: -1 })
        .limit(limit);
      
      if (similarProducts.length < limit) {
        // If not enough products in the same category, add some top-rated products
        const remainingNeeded = limit - similarProducts.length;
        const topRatedProducts = await Product.find({
          _id: { $ne: productId, $nin: similarProducts.map(p => p._id) },
          stock: { $gt: 0 }
        })
          .sort({ averageRating: -1 })
          .limit(remainingNeeded);
        
        similarProducts.push(...topRatedProducts);
      }
      
      return similarProducts;
    } catch (error) {
      console.error('Error getting similar products:', error);
      return this.getGeneralRecommendations({ limit });
    }
  }
  
  /**
   * Get category-based recommendations
   */
  async getCategoryRecommendations(category: string, options: RecommendationOptions = {}) {
    const limit = options.limit || 10;
    
    try {
      return await Product.find({
        category,
        stock: { $gt: 0 }
      })
        .sort({ averageRating: -1 })
        .limit(limit);
    } catch (error) {
      console.error('Error getting category recommendations:', error);
      return this.getGeneralRecommendations({ limit });
    }
  }
  
  /**
   * Get general recommendations when no user data is available
   */
  async getGeneralRecommendations(options: RecommendationOptions = {}) {
    const limit = options.limit || 10;
    
    try {
      // Combine different recommendation strategies
      
      // 1. Featured products (assuming you have a featured field)
      const featuredProducts = await Product.find({ 
        featured: true,
        stock: { $gt: 0 }
      }).limit(Math.ceil(limit / 3));
      
      const featuredIds = featuredProducts.map(p => p._id);
      
      // 2. Highest rated products
      const topRatedProducts = await Product.find({ 
        _id: { $nin: featuredIds },
        stock: { $gt: 0 }
      })
        .sort({ averageRating: -1 })
        .limit(Math.ceil(limit / 3));
      
      const topRatedIds = topRatedProducts.map(p => p._id);
      
      // 3. Newest products
      const newProducts = await Product.find({ 
        _id: { $nin: [...featuredIds, ...topRatedIds] },
        stock: { $gt: 0 }
      })
        .sort({ createdAt: -1 })
        .limit(limit - featuredProducts.length - topRatedProducts.length);
      
      // Combine all recommendations
      return [...featuredProducts, ...topRatedProducts, ...newProducts];
    } catch (error) {
      console.error('Error getting general recommendations:', error);
      // As a last resort, return any products
      return Product.find({ stock: { $gt: 0 } }).limit(limit);
    }
  }
  
  /**
   * Get best sellers based on order data
   */
  async getBestSellers(options: RecommendationOptions = {}) {
    const limit = options.limit || 10;
    
    try {
      // Aggregate order data to find most purchased products
      const bestSellerIds = await Order.aggregate([
        { $unwind: '$items' },
        { 
          $group: { 
            _id: '$items.productId', 
            totalSold: { $sum: '$items.quantity' } 
          } 
        },
        { $sort: { totalSold: -1 } },
        { $limit: limit }
      ]);
      
      // Get full product details for best sellers
      const productIds = bestSellerIds.map(item => item._id);
      const bestSellers = await Product.find({ 
        _id: { $in: productIds },
        stock: { $gt: 0 }
      });
      
      // Sort results according to the bestseller ranking
      return bestSellers.sort((a:any, b:any) => {
        const aRank = productIds.findIndex(id => id === a._id.toString());
        const bRank = productIds.findIndex(id => id === b._id.toString());
        return aRank - bRank;
      });
    } catch (error) {
      console.error('Error getting bestsellers:', error);
      return this.getGeneralRecommendations({ limit });
    }
  }
  
  /**
   * Get trending products based on recent order data
   */
  async getTrendingProducts(options: RecommendationOptions = {}) {
    const limit = options.limit || 10;
    const daysToLookBack = 7; // Look at the last 7 days
    
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - daysToLookBack);
      
      // Aggregate recent order data
      const trendingProductIds = await Order.aggregate([
        { $match: { createdAt: { $gte: oneWeekAgo } } },
        { $unwind: '$items' },
        { 
          $group: { 
            _id: '$items.productId', 
            totalSold: { $sum: '$items.quantity' } 
          } 
        },
        { $sort: { totalSold: -1 } },
        { $limit: limit }
      ]);
      
      // Get full product details
      const productIds = trendingProductIds.map(item => item._id);
      const trendingProducts = await Product.find({ 
        _id: { $in: productIds },
        stock: { $gt: 0 }
      });
      
      // Sort results according to the trending ranking
      return trendingProducts.sort((a:any, b:any) => {
        const aRank = productIds.findIndex(id => id === a._id.toString());
        const bRank = productIds.findIndex(id => id === b._id.toString());
        return aRank - bRank;
      });
    } catch (error) {
      console.error('Error getting trending products:', error);
      return this.getGeneralRecommendations({ limit });
    }
  }
  
  /**
   * Get personalized recommendations for a user
   */
  async getPersonalizedRecommendations(options: RecommendationOptions = {}) {
    const { userId, limit = 10 } = options;
    
    // If userId is provided, get user-based recommendations
    if (userId) {
      return this.getUserBasedRecommendations(userId, { limit });
    }
    
    // Otherwise, return general recommendations
    return this.getGeneralRecommendations({ limit });
  }
}

export default new RecommendationService();