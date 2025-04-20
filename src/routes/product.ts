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
router.post('/products',authenticate, createProduct);
router.get('/products',getProducts);
router.get('/products/:id', getProductById);
router.put('/products/:id',authenticate, updateProduct);
router.delete('/products/:id',authenticate, deleteProduct);

export default router;