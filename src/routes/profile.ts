import express from 'express';




import {authenticate }from '../middlewares/auth.middleware';
import { addAddress, deleteAddress, emailVerification, emailVerificationToken, getAddress, getAddressById, getProfile, updateAddress, updateProfile } from '../controllers/profile.controller';

const router = express.Router();

// Profile routes
router.get('/', getProfile);
router.patch('/update', updateProfile);


router.get('/addresses', getAddress);
router.get('/addresses/:id', getAddressById);
router.post('/addresses', addAddress);
router.patch('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);


router.post('/verify-email/request', emailVerification);
router.post('/verify-email/:token', emailVerificationToken);

export default router;