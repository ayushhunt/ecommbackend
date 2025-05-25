import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
} from '../controllers/product.controller';
import { authenticateAdmin } from '../middlewares/auth.middleware';

const router = express.Router();

const UPLOAD_DIRECTORY = 'uploads/products';
const FULL_UPLOAD_PATH = path.join(__dirname, '../..', UPLOAD_DIRECTORY);

// Ensure uploads folder exists
if (!fs.existsSync(FULL_UPLOAD_PATH)) {
  fs.mkdirSync(FULL_UPLOAD_PATH, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, FULL_UPLOAD_PATH);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Routes
router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.post('/products', authenticateAdmin, upload.array('images', 5), createProduct);
router.put('/products/:id', authenticateAdmin, updateProduct);
router.delete('/products/:id', authenticateAdmin, deleteProduct);

export default router;
