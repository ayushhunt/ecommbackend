import express from 'express';
import {
  // User endpoints
  createReview,
  getUserReviews,
  updateReview,
  deleteReview,
  
  // Public endpoints
  getProductReviews,
  
  // Admin endpoints
  getAllReviews,
  adminDeleteReview
} from '../controllers/review.controller';

// Import middleware
import { authenticate, authenticateAdmin } from '../middlewares/auth.middleware';

// Import admin authorization middleware (you'll need to implement this)


const router = express.Router();

// ===== USER ROUTES =====
router.post('/reviews', authenticate, createReview);
router.get('/user/reviews', authenticate, getUserReviews);
router.put('/reviews/:id', authenticate, updateReview);
router.delete('/reviews/:id', authenticate, deleteReview);

// ===== PUBLIC ROUTES =====
router.get('/products/:productId/reviews', getProductReviews);

// ===== ADMIN ROUTES =====
router.get('/admin/reviews', authenticateAdmin,  getAllReviews);
router.delete('/admin/reviews/:id', authenticateAdmin,  adminDeleteReview);

export default router;