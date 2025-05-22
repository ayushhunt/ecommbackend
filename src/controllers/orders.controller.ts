import { Request, Response } from 'express';
import { Order } from '../models/order';
import { Product } from '../models/product';
import { DeliveryStatus, PaymentStatus } from '../models/order';
import mongoose from 'mongoose';

// ===== USER ENDPOINTS =====

// Create a new order
export const createOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, paymentMethod, shippingAddress } = req.body;
    const userId = req.user.id; // Assuming user ID is available from authentication middleware

    // Validate items and calculate total amount
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product).session(session);
      
      if (!product) {
        throw new Error(`Product not found with ID: ${item.product}`);
      }
      
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product: ${product.name}`);
      }
      
      // Update product stock
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: -item.quantity } },
        { session }
      );
      
      // Add item to order with current price
      orderItems.push({
        product: item.product,
        quantity: item.quantity,
        price: product.price
      });
      
      totalAmount += product.price * item.quantity;
    }

    // Create new order
    const order = new Order({
      user: userId,
      items: orderItems,
      totalAmount,
      paymentMethod,
      shippingAddress,
      paymentStatus: PaymentStatus.PENDING,
      deliveryStatus: DeliveryStatus.PENDING
    });

    await order.save({ session });
    await session.commitTransaction();

    // Populate product details for response
    const populatedOrder = await Order.findById(order._id).populate({
      path: 'items.product',
      select: 'name images'
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: populatedOrder
    });
    return;
  } catch (error: any) {
    await session.abortTransaction();
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create order',
      error: error
    });
    return;
  } finally {
    session.endSession();
  }
};

// export const createOrder = async (req: Request, res: Response) => {
//   try {
//     const { items, paymentMethod, shippingAddress } = req.body;
//     console.log(req.user.id)
//     const userId = req.user.id;

//     let totalAmount = 0;
//     const orderItems = [];

//     // Use Promise.all for concurrent product checks
//     await Promise.all(items.map(async (item:any) => {
//       const product = await Product.findById(item.product);
      
//       if (!product) {
//         throw new Error(`Product not found with ID: ${item.product}`);
//       }
      
//       if (product.stock < item.quantity) {
//         throw new Error(`Insufficient stock for product: ${product.name}`);
//       }
//     }));

//     // Perform stock updates and order item preparation
//     for (const item of items) {
//       // Atomic update to ensure stock reduction
//       const updatedProduct = await Product.findByIdAndUpdate(
//         item.product, 
//         { $inc: { stock: -item.quantity } }, 
//         { new: true }
//       );

//       if (!updatedProduct) {
//         throw new Error(`Failed to update stock for product: ${item.product}`);
//       }

//       orderItems.push({
//         product: item.product,
//         quantity: item.quantity,
//         price: updatedProduct.price
//       });

//       totalAmount += updatedProduct.price * item.quantity;
//     }

//     // Create new order
//     const order = new Order({
//       user: userId,
//       items: orderItems,
//       totalAmount,
//       paymentMethod,
//       shippingAddress,
//       paymentStatus: PaymentStatus.PENDING,
//       deliveryStatus: DeliveryStatus.PENDING
//     });

//     await order.save();

//     // Populate product details for response
//     const populatedOrder = await Order.findById(order._id).populate({
//       path: 'items.product',
//       select: 'name images'
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Order created successfully',
//       data: populatedOrder
//     });
//     return;

//   } catch (error: any) {
//     // Rollback stock updates (optional, but provides additional safety)
//     if (error.message.includes('Insufficient stock') || error.message.includes('Product not found')) {
//       for (const item of req.body.items) {
//         await Product.findByIdAndUpdate(
//           item.product, 
//           { $inc: { stock: item.quantity } }
//         );
//       }
//     }

//     res.status(400).json({
//       success: false,
//       message: error.message || 'Failed to create order',
//       error: error
//     });
//     return;
//   }
// };



// Get all orders for current user
export const getUserOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { page = 1, limit = 10, status } = req.query;
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter
    const filter: any = { user: userId };
    
    if (status) {
      filter.deliveryStatus = status;
    }
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate({
        path: 'items.product',
        select: 'name images'
      });
    
    const totalOrders = await Order.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: orders,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / limitNum),
        totalItems: totalOrders,
        limit: limitNum
      }
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve orders',
      error: error
    });
    return;
  }
};

// Get a specific order by ID (for user)
export const getUserOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // From auth middleware
    
    const order = await Order.findOne({ _id: id, user: userId })
      .populate({
        path: 'items.product',
        select: 'name description images'
      });
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Order retrieved successfully',
      data: order
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve order',
      error: error
    });
    return;
  }
};

// Cancel an order (user)
export const cancelOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const userId = req.user.id; // From auth middleware
    
    const order = await Order.findOne({ _id: id, user: userId }).session(session);
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    // Only allow cancellation if order is still pending
    if (order.deliveryStatus !== DeliveryStatus.PENDING) {
      res.status(400).json({
        success: false,
        message: `Cannot cancel order in '${order.deliveryStatus}' status`
      });
      return;
    }
    
    // Update order status
    order.deliveryStatus = DeliveryStatus.CANCELLED;
    await order.save({ session });
    
    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity } },
        { session }
      );
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: order
    });
    return;
  } catch (error: any) {
    await session.abortTransaction();
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to cancel order',
      error: error
    });
    return;
  } finally {
    session.endSession();
  }
};


// export const cancelOrder = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const userId = req.user.id; // From auth middleware

//     // Find the order
//     const order = await Order.findOne({ _id: id, user: userId });

//     if (!order) {
//       res.status(404).json({
//         success: false,
//         message: 'Order not found'
//       });
//       return;
//     }

//     // Only allow cancellation if order is still pending
//     if (order.deliveryStatus !== DeliveryStatus.PENDING) {
//       res.status(400).json({
//         success: false,
//         message: `Cannot cancel order in '${order.deliveryStatus}' status`
//       });
//       return;
//     }

//     // Update order status
//     order.deliveryStatus = DeliveryStatus.CANCELLED;
//     await order.save();

//     // Use Promise.all to restore product stock concurrently
//     const stockRestorePromises = order.items.map(item => 
//       Product.findByIdAndUpdate(
//         item.product, 
//         { $inc: { stock: item.quantity } }
//       )
//     );

//     // Wait for all stock restoration operations to complete
//     await Promise.all(stockRestorePromises);

//     res.status(200).json({
//       success: true,
//       message: 'Order cancelled successfully',
//       data: order
//     });
//     return;

//   } catch (error: any) {
//     res.status(400).json({
//       success: false,
//       message: error.message || 'Failed to cancel order',
//       error: error
//     });
//     return;
//   }
// };
// ===== ADMIN ENDPOINTS =====




// Get all orders (admin)
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      deliveryStatus,
      paymentStatus,
      startDate,
      endDate,
      userId
    } = req.query;
    
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter
    const filter: any = {};
    
    if (deliveryStatus) {
      filter.deliveryStatus = deliveryStatus;
    }
    
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }
    
    if (userId) {
      filter.user = userId;
    }
    
    // Date filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('user createdAt')
    
    const totalOrders = await Order.countDocuments(filter);
    
    // Calculate statistics
    const totalRevenue = await Order.aggregate([
      { $match: { ...filter, paymentStatus: PaymentStatus.COMPLETED } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: orders,
      statistics: {
        totalRevenue: totalRevenue.length ? totalRevenue[0].total : 0
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / limitNum),
        totalItems: totalOrders,
        limit: limitNum
      }
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve orders',
      error: error
    });
    return;
  }
};

// Get order by ID (admin)
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findById(id)
      .select('user createdAt')
      .populate({
        path: 'items.product',
        select: 'name description images'
      });
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Order retrieved successfully',
      data: order
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve order',
      error: error
    });
    return;
  }
};

// Update order status (admin)
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deliveryStatus, paymentStatus, transactionId } = req.body;
    
    const order = await Order.findById(id);
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    // Update fields if provided
    if (deliveryStatus) {
      order.deliveryStatus = deliveryStatus;
    }
    
    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }
    
    if (transactionId) {
      order.transactionId = transactionId;
    }
    
    await order.save();
    
    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });
    return;
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update order status',
      error: error
    });
    return;
  }
};

// Delete order (admin) - usually soft delete in production
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findById(id);
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    await Order.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Order deleted successfully'
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete order',
      error: error
    });
    return;
  }
};

// Get order statistics (admin)
export const getOrderStatistics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build time filter
    const timeFilter: any = {};
    if (startDate) timeFilter.$gte = new Date(startDate as string);
    if (endDate) timeFilter.$lte = new Date(endDate as string);
    
    // Base match condition
    const matchCondition: any = {};
    if (startDate || endDate) matchCondition.createdAt = timeFilter;
    
    // Total orders by status
    const ordersByStatus = await Order.aggregate([
      { $match: matchCondition },
      { $group: {
        _id: "$deliveryStatus",
        count: { $sum: 1 },
        revenue: { $sum: "$totalAmount" }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Orders by day (for chart)
    const ordersByDay = await Order.aggregate([
      { $match: matchCondition },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        revenue: { $sum: "$totalAmount" }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Top selling products
    const topProducts = await Order.aggregate([
      { $match: matchCondition },
      { $unwind: "$items" },
      { $group: {
        _id: "$items.product",
        totalQuantity: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails"
      }},
      { $unwind: "$productDetails" },
      { $project: {
        _id: 1,
        name: "$productDetails.name",
        totalQuantity: 1,
        totalRevenue: 1
      }}
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Order statistics retrieved successfully',
      data: {
        ordersByStatus,
        ordersByDay,
        topProducts
      }
    });
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve order statistics',
      error: error
    });
    return;
  }
};

