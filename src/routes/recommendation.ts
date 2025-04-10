// src/routes/recommendationRoutes.ts

import express from 'express';
import { 
  getRecommendations,
  getSimilarProducts,
  getCategoryRecommendations,
  getBestSellers,
  getTrendingProducts,
  getRelatedProducts
} from '../controllers/recommendation.controller';


const router = express.Router();

// Apply optional auth middleware to get user context when available


// Recommendation routes
router.get('/', getRecommendations);
router.get('/similar/:productId', getSimilarProducts);
router.get('/category/:category', getCategoryRecommendations);
router.get('/bestsellers', getBestSellers);
router.get('/trending', getTrendingProducts);
router.get('/related/:productId?', getRelatedProducts);

export default router;