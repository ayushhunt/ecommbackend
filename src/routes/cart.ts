import express from 'express';
import { 
  getCart, 
  addItemsToCart, 
  updateCartItem, 
  removeCartItem, 
  clearCart, 
  checkoutCart 
} from '../controllers/cart.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = express.Router();



// Cart routes
router.get('/',authenticate, getCart);
router.post('/add',authenticate, addItemsToCart);
router.put('/update/:productId', updateCartItem);
router.delete('/remove/:productId', removeCartItem);
router.delete('/clear', clearCart);
router.post('/checkout', checkoutCart);

export default router;