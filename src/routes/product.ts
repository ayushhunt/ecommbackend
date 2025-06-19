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

const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Videos
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/avi',
  'video/mov',
  // 3D Models
  'model/gltf+json',
  'model/gltf-binary',
  'model/vnd.usdz+zip',
  'application/octet-stream', // For .glb files
  'model/obj',
  'model/fbx'
];

const router = express.Router();

const UPLOAD_DIRECTORY = 'uploads/products';
const FULL_UPLOAD_PATH = path.join(__dirname, '../..', UPLOAD_DIRECTORY);

// Ensure uploads folder exists with subdirectories
const createUploadDirs = () => {
  const dirs = [
    FULL_UPLOAD_PATH,
    path.join(FULL_UPLOAD_PATH, 'images'),
    path.join(FULL_UPLOAD_PATH, 'videos'),
    path.join(FULL_UPLOAD_PATH, '3d-models')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createUploadDirs();

// Helper function to determine file type and subdirectory
const getFileTypeAndPath = (mimetype: string, originalname: string) => {
  if (mimetype.startsWith('image/')) {
    return { type: 'image', subDir: 'images' };
  } else if (mimetype.startsWith('video/')) {
    return { type: 'video', subDir: 'videos' };
  } else if (mimetype.startsWith('model/') || 
             mimetype === 'application/octet-stream' ||
             originalname.toLowerCase().endsWith('.glb') ||
             originalname.toLowerCase().endsWith('.gltf') ||
             originalname.toLowerCase().endsWith('.usdz') ||
             originalname.toLowerCase().endsWith('.obj') ||
             originalname.toLowerCase().endsWith('.fbx')) {
    return { type: '3d_model', subDir: '3d-models' };
  }
  return { type: 'image', subDir: 'images' }; // Default fallback
};

// Enhanced Multer config
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const { subDir } = getFileTypeAndPath(file.mimetype, file.originalname);
    const destinationPath = path.join(FULL_UPLOAD_PATH, subDir);
    cb(null, destinationPath);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const { type } = getFileTypeAndPath(file.mimetype, file.originalname);
    cb(null, `${type}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const isValidType = ALLOWED_MIME_TYPES.includes(file.mimetype) ||
                       file.originalname.toLowerCase().endsWith('.glb') ||
                       file.originalname.toLowerCase().endsWith('.gltf') ||
                       file.originalname.toLowerCase().endsWith('.usdz') ||
                       file.originalname.toLowerCase().endsWith('.obj') ||
                       file.originalname.toLowerCase().endsWith('.fbx');
    
    if (isValidType) {
      cb(null, true);
    } else {
      cb(new Error('Only image, video, or 3D model files are allowed'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // max 100MB per file (increased for 3D models)
    files: 20 // max 20 files (increased for multiple media types)
  }
});

// Routes
router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.post('/products', authenticateAdmin, upload.array('media', 20), createProduct);
router.put('/products/:id', authenticateAdmin, upload.array('media', 20), updateProduct);
router.delete('/products/:id', authenticateAdmin, deleteProduct);

export default router;
