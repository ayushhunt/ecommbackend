import express from 'express';
import { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct, 
  deleteProduct 
} from '../controllers/product.controller';
import { authenticate, authenticateAdmin } from '../middlewares/auth.middleware';

const router = express.Router();

// Product routes
router.post('/products',authenticateAdmin, createProduct);
router.get('/products',getProducts);
router.get('/products/:id', getProductById);
router.put('/products/:id',authenticateAdmin, updateProduct);
router.delete('/products/:id',authenticateAdmin, deleteProduct);

export default router;