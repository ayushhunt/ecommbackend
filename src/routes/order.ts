import express from 'express';
import {
  // User endpoints
  createOrder,
  getUserOrders,
  getUserOrderById,
  cancelOrder,
  
  // Admin endpoints
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  getOrderStatistics
} from '../controllers/orders.controller';

// Import middleware (these would be your auth middlewares)
import {authenticate }from '../middlewares/auth.middleware';

const router = express.Router();

// ===== USER ROUTES =====
router.post('/orders', authenticate, createOrder);
router.get('/user/orders', authenticate, getUserOrders);
router.get('/user/orders/:id', authenticate, getUserOrderById);
router.patch('/user/orders/:id/cancel', authenticate, cancelOrder);

// ===== ADMIN ROUTES =====
router.get('/admin/orders', authenticate, authenticate, getAllOrders);
router.get('/admin/orders/statistics', authenticate, authenticate, getOrderStatistics);
router.get('/admin/orders/:id', authenticate, authenticate, getOrderById);
router.patch('/admin/orders/:id/status', authenticate, authenticate, updateOrderStatus);
router.delete('/admin/orders/:id', authenticate, authenticate, deleteOrder);

export default router;