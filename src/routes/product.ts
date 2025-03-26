import express from 'express';
import { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct, 
  deleteProduct 
} from '../controllers/product.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = express.Router();

// Product routes
router.post('/products', createProduct);
router.get('/products',getProducts);
router.get('/products/:id', getProductById);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

export default router;