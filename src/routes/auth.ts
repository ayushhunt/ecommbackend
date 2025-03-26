// src/routes/auth.route.ts
import express from 'express';
import {
  register,
  login,
  refreshToken,
} from '../controllers/auth.controller';

const router = express.Router();

// Local authentication
router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token',refreshToken)

// // Google authentication
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// router.get(
//   '/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   googleCallback
// );

export default router;