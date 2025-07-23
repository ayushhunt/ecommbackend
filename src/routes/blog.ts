import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import {
  getAllBlogs,
  getBlogBySlug,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  togglePublishStatus,
  getBlogsByTag
} from '../controllers/blog.controller';
import { authenticateAdmin } from '../middlewares/auth.middleware';

const router = express.Router();

// Blog image upload configuration
const BLOG_UPLOAD_DIRECTORY = 'uploads/blogs';
const FULL_UPLOAD_PATH = path.join(__dirname, '../..', BLOG_UPLOAD_DIRECTORY);

// Only allow image files for blogs
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp',
  'image/gif'
];

// Ensure blog uploads folder exists
const createBlogUploadDirs = () => {
  const dirs = [
    FULL_UPLOAD_PATH,
    path.join(FULL_UPLOAD_PATH, 'images')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createBlogUploadDirs();

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const destinationPath = path.join(FULL_UPLOAD_PATH, 'images');
    cb(null, destinationPath);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `blog-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for blog uploads'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // max 5MB per image
    files: 10 // max 10 images per blog
  }
});

// Public routes (no authentication required)
router.get('/', getAllBlogs);                    // GET /api/blogs
router.get('/slug/:slug', getBlogBySlug);        // GET /api/blogs/slug/my-blog-post
router.get('/tag/:tag', getBlogsByTag);          // GET /api/blogs/tag/technology

// Admin routes (add authentication middleware as needed)
router.get('/:id', getBlogById);                 // GET /api/blogs/64f8a1b2c3d4e5f6a7b8c9d0
router.post('/',authenticateAdmin, upload.array('images', 10), createBlog); // POST /api/blogs (with image upload)
router.put('/:id',authenticateAdmin, updateBlog);                  // PUT /api/blogs/64f8a1b2c3d4e5f6a7b8c9d0
router.delete('/:id',authenticateAdmin, deleteBlog);               // DELETE /api/blogs/64f8a1b2c3d4e5f6a7b8c9d0
router.patch('/:id/publish',authenticateAdmin, togglePublishStatus); // PATCH /api/blogs/64f8a1b2c3d4e5f6a7b8c9d0/publish

export default router;