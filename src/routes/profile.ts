import express from 'express';




import {authenticate }from '../middlewares/auth.middleware';
import { emailVerification, emailVerificationToken, getAddress, getAddressById, getProfile, updateProfile } from '../controllers/profile.controller';

const router = express.Router();

// Cart routes
router.get('/',authenticate, getProfile);
router.post('/add',authenticate, updateProfile);
router.put('/update/:productId', emailVerification);
router.delete('/remove/:productId', emailVerificationToken);
router.delete('/clear', getAddress);
router.post('/checkout', getAddressById);
router.post('/checkout', addAddress);
router.post('/checkout', updateAddress);
router.post('/checkout', deleteAddress);
