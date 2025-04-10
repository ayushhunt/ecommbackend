import express from 'express';
import { 
  getWishlist, 
  addToWishlist, 
  removeFromWishlist, 
  clearWishlist, 
  moveToCart, 
  moveAllToCart,
  checkWishlist
} from '../controllers/wishlist.controller';


const router = express.Router();

// Apply auth middleware to all wishlist routes


// Wishlist routes
router.get('/', getWishlist);
router.post('/add', addToWishlist);
router.delete('/remove/:productId', removeFromWishlist);
router.delete('/clear', clearWishlist);
router.post('/move-to-cart/:productId', moveToCart);
router.post('/move-all-to-cart', moveAllToCart);
router.get('/check/:productId', checkWishlist);

export default router;