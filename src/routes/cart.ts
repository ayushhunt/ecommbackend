import express from 'express';
import { 
  getCart, 
  addItemToCart, 
  updateCartItem, 
  removeCartItem, 
  clearCart, 
  checkoutCart 
} from '../controllers/cart.controller';

const router = express.Router();



// Cart routes
router.get('/', getCart);
router.post('/add', addItemToCart);
router.put('/update/:productId', updateCartItem);
router.delete('/remove/:productId', removeCartItem);
router.delete('/clear', clearCart);
router.post('/checkout', checkoutCart);

export default router;