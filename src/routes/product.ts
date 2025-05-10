import express from 'express';
import { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct, 
  deleteProduct 
} from '../controllers/product.controller';
import { authenticate, authenticateAdmin } from '../middlewares/auth.middleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const FRONTEND_PUBLIC_PATH = '/Users/ayushsingh/Desktop/Working 101/relotfrontend/public';
const UPLOAD_DIRECTORY = 'uploads/products';
const FULL_UPLOAD_PATH = path.join(FRONTEND_PUBLIC_PATH, UPLOAD_DIRECTORY);

// Create the directory if it doesn't exist
if (!fs.existsSync(FULL_UPLOAD_PATH)) {
  fs.mkdirSync(FULL_UPLOAD_PATH, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, FULL_UPLOAD_PATH);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

// Create upload middleware
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Product routes
router.get('/products',getProducts);
router.get('/products/:id', getProductById);


router.post('/products',authenticateAdmin,upload.array('images', 5), createProduct);
router.put('/products/:id',authenticateAdmin, updateProduct);
router.delete('/products/:id',authenticateAdmin, deleteProduct);

export default router;