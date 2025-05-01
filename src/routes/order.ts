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
import {authenticate, authenticateAdmin }from '../middlewares/auth.middleware';

const router = express.Router();

// ===== USER ROUTES =====
router.post('/orders', authenticate, createOrder);
router.get('/user/orders', authenticate, getUserOrders);
router.get('/user/orders/:id', authenticate, getUserOrderById);
router.patch('/user/orders/:id/cancel', authenticate, cancelOrder);

// ===== ADMIN ROUTES =====
router.get('/admin/orders', authenticateAdmin, getAllOrders);
router.get('/admin/orders/statistics', authenticateAdmin, getOrderStatistics);
router.get('/admin/orders/:id', authenticateAdmin, getOrderById);
router.patch('/admin/orders/:id/status', authenticateAdmin, updateOrderStatus);
router.delete('/admin/orders/:id', authenticateAdmin,deleteOrder);

export default router;