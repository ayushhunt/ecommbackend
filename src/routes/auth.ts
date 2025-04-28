// src/routes/auth.route.ts
import express from 'express';
import {
  register,
  login,
  refreshToken,
  googleAuth,
  googleCallback,
  logout,
} from '../controllers/auth.controller';

const router = express.Router();

// Local authentication
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh-token',refreshToken)

// // Google authentication
router.get('/google',googleAuth);
router.get('/google/callback',googleCallback);

export default router;