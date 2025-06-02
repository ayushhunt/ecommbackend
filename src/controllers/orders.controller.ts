import { Request, Response } from 'express';
import { Order } from '../models/order';
import { Product } from '../models/product';
import { DeliveryStatus, PaymentStatus } from '../models/order';
import PDFDocument from "pdfkit";
import mongoose from 'mongoose';

// ===== USER ENDPOINTS =====

// Create a new order
// export const createOrder = async (req: Request, res: Response) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { items, paymentMethod, shippingAddress } = req.body;
//     const userId = req.user.id; // Assuming user ID is available from authentication middleware

//     // Validate items and calculate total amount
//     let totalAmount = 0;
//     const orderItems = [];

//     for (const item of items) {
//       const product = await Product.findById(item.product).session(session);
      
//       if (!product) {
//         throw new Error(`Product not found with ID: ${item.product}`);
//       }
      
//       if (product.stock < item.quantity) {
//         throw new Error(`Insufficient stock for product: ${product.name}`);
//       }
      
//       // Update product stock
//       await Product.findByIdAndUpdate(
//         item.product,
//         { $inc: { stock: -item.quantity } },
//         { session }
//       );
      
//       // Add item to order with current price
//       orderItems.push({
//         product: item.product,
//         quantity: item.quantity,
//         price: product.price
//       });
      
//       totalAmount += product.price * item.quantity;
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

//     await order.save({ session });
//     await session.commitTransaction();

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
//     await session.abortTransaction();
    
//     res.status(400).json({
//       success: false,
//       message: error.message || 'Failed to create order',
//       error: error
//     });
//     return;
//   } finally {
//     session.endSession();
//   }
// };


interface OrderItem {
  product: string;
  quantity: number;
}

interface CreateOrderRequest {
  items: OrderItem[];
  paymentMethod: string;
  shippingAddress: any;
}

// Update createOrder function with discount and finalPrice handling
export const createOrder = async (req: Request, res: Response) => {
  const stockUpdates: Array<{ productId: string; quantity: number }> = [];
  
  try {
    const { items, paymentMethod, shippingAddress }: CreateOrderRequest = req.body;
    const userId = req.user.id;

    // Input validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Items array is required and cannot be empty'
      });
      return;
    }

    if (!paymentMethod || !shippingAddress) {
      res.status(400).json({
        success: false,
        message: 'Payment method and shipping address are required'
      });
      return;
    }

    // Validate item structure
    for (const item of items) {
      if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
        res.status(400).json({
          success: false,
          message: `Invalid product ID: ${item.product}`
        });
        return;
      }

      if (!item.quantity || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        res.status(400).json({
          success: false,
          message: `Invalid quantity for product ${item.product}. Must be a positive integer`
        });
        return;
      }
    }

    // Check for duplicate products in order
    const productIds = items.map(item => item.product);
    const uniqueProductIds = new Set(productIds);
    if (productIds.length !== uniqueProductIds.size) {
      res.status(400).json({
        success: false,
        message: 'Duplicate products in order. Please combine quantities for the same product'
      });
      return;
    }

    let totalAmount = 0;
    const orderItems = [];

    // Process each item with atomic stock updates and discount handling
    for (const item of items) {
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: item.product,
          stock: { $gte: item.quantity },
          isActive: { $ne: false }
        },
        { 
          $inc: { stock: -item.quantity }
        },
        { 
          new: true,
          runValidators: true
        }
      );

      if (!updatedProduct) {
        // Check specific failure reason
        const product = await Product.findById(item.product);
        
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }
        
        
        
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
        }
        
        throw new Error(`Failed to reserve stock for product: ${product.name}`);
      }

      // Track successful stock update for potential rollback
      stockUpdates.push({
        productId: item.product,
        quantity: item.quantity
      });

      // Calculate final price with discount
      const discount = updatedProduct.discount || 0;
      const finalPrice = updatedProduct.price * (1 - discount / 100);

      orderItems.push({
        product: item.product,
        quantity: item.quantity,
        price: updatedProduct.price,
        discount: discount,
        finalPrice: finalPrice,
        name: updatedProduct.name,
        image: updatedProduct.images[0]
      });

      totalAmount += finalPrice * item.quantity;
    }

    // Validate total amount
    if (totalAmount <= 0) {
      throw new Error('Invalid order total amount');
    }

    // Create order with validation
    const orderData = {
      user: userId,
      items: orderItems,
      totalAmount,
      paymentMethod,
      shippingAddress,
      paymentStatus: PaymentStatus.PENDING,
      deliveryStatus: DeliveryStatus.PENDING,
      createdAt: new Date()
    };

    const order = new Order(orderData);
    
    // Validate order before saving
    const validationError = order.validateSync();
    if (validationError) {
      throw new Error(`Order validation failed: ${validationError.message}`);
    }

    await order.save();

    // Populate product details for response
    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: 'items.product',
        select: 'name images price'
      })
      .populate({
        path: 'user',
        select: 'name email'
      });

    if (!populatedOrder) {
      throw new Error('Failed to retrieve created order');
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: populatedOrder
    });
    return;

  } catch (error: any) {
    console.error('Error creating order:', {
      userId: req.user?.id,
      items: req.body?.items,
      error: error.message,
      stack: error.stack
    });

    // Rollback stock updates on failure
    if (stockUpdates.length > 0) {
      console.log('Rolling back stock updates for failed order...');
      
      const rollbackResults = await Promise.allSettled(
        stockUpdates.map(async ({ productId, quantity }) => {
          try {
            const result = await Product.findByIdAndUpdate(
              productId,
              { $inc: { stock: quantity } },
              { new: true }
            );
            
            if (!result) {
              console.error(`Failed to rollback stock for product: ${productId}`);
            }
            
            return { productId, success: !!result };
          } catch (rollbackError) {
            console.error(`Rollback error for product ${productId}:`, rollbackError);
            return { productId, success: false, error: rollbackError };
          }
        })
      );

      const failedRollbacks = rollbackResults
        .filter(result => result.status === 'rejected' || 
                (result.status === 'fulfilled' && !result.value.success))
        .length;

      if (failedRollbacks > 0) {
        console.error(`Critical: ${failedRollbacks} stock rollbacks failed. Manual intervention required.`);
        // In production, send alert to admin/monitoring system
      }
    }

    // Determine appropriate error status and message
    let statusCode = 500;
    let message = 'Failed to create order due to server error';

    if (error.message.includes('not found') || 
        error.message.includes('no longer available')) {
      statusCode = 404;
      message = error.message;
    } else if (error.message.includes('Insufficient stock') || 
               error.message.includes('Invalid') ||
               error.message.includes('validation failed') ||
               error.message.includes('Duplicate products')) {
      statusCode = 400;
      message = error.message;
    }

    res.status(statusCode).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        stockUpdatesAttempted: stockUpdates.length 
      })
    });
    return;
  }
};


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


export const downloadInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // Ensure auth middleware adds user

    const order = await Order.findOne({ _id: id, user: userId }).populate({
      path: 'items.product',
      select: 'name description images'
    });

    if (!order) {
      res.status(404).json({ success: false, message: "Order not found" });
      return;
    }

    // Set response headers for file download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${order._id}.pdf`);

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // --- Header ---
    doc.fontSize(20).text("Invoice", { align: "center" });
    doc.moveDown();

    // --- Order Info ---
    doc.fontSize(12).text(`Order ID: ${order._id}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Payment Method: ${order.paymentMethod}`);
    doc.text(`Payment Status: ${order.paymentStatus}`);
    doc.text(`Delivery Status: ${order.deliveryStatus}`);
    doc.moveDown();

    // --- Shipping Address ---
    doc.fontSize(14).text("Shipping Address", { underline: true });
    const { shippingAddress } = order;
    doc.fontSize(12).text(`${shippingAddress.name}`);
    doc.text(`${shippingAddress.street}, ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.zipCode}`);
    doc.text(`Phone: ${shippingAddress.phone}`);
    doc.moveDown();

    // --- Order Items ---
    doc.fontSize(14).text("Order Items", { underline: true });
    order.items.forEach((item: any, i: number) => {
      const y = doc.y + 10;
      doc.fontSize(12).text(
        `${i + 1}. ${item.product?.name || item.name} - Qty: ${item.quantity} - ₹${item.finalPrice} x ${item.quantity} = ₹${item.finalPrice * item.quantity}`,
        { continued: false }
      );
    });

    doc.moveDown();
    doc.fontSize(14).text(`Total Amount: ₹${order.totalAmount}`, { align: "right" });

    // Finalize
    doc.end();
  } catch (error: any) {
    console.error("PDF generation failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to generate invoice",
      error: error.message
    });
  }
};




// Cancel an order (user)
// export const cancelOrder = async (req: Request, res: Response) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const { id } = req.params;
//     const userId = req.user.id; // From auth middleware
    
//     const order = await Order.findOne({ _id: id, user: userId }).session(session);
    
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
//     await order.save({ session });
    
//     // Restore product stock
//     for (const item of order.items) {
//       await Product.findByIdAndUpdate(
//         item.product,
//         { $inc: { stock: item.quantity } },
//         { session }
//       );
//     }
    
//     await session.commitTransaction();
    
//     res.status(200).json({
//       success: true,
//       message: 'Order cancelled successfully',
//       data: order
//     });
//     return;
//   } catch (error: any) {
//     await session.abortTransaction();
    
//     res.status(400).json({
//       success: false,
//       message: error.message || 'Failed to cancel order',
//       error: error
//     });
//     return;
//   } finally {
//     session.endSession();
//   }
// };


export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
      return;
    }

    // Find and update order atomically with conditions
    const order = await Order.findOneAndUpdate(
      { 
        _id: id, 
        user: userId,
        deliveryStatus: DeliveryStatus.PENDING // Only update if still pending
      },
      { 
        deliveryStatus: DeliveryStatus.CANCELLED,
        cancelledAt: new Date()
      },
      { 
        new: true, // Return updated document
        runValidators: true
      }
    );

    if (!order) {
      // Check if order exists but in wrong state
      const existingOrder = await Order.findOne({ _id: id, user: userId });
      
      if (!existingOrder) {
        res.status(404).json({
          success: false,
          message: 'Order not found'
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: `Cannot cancel order in '${existingOrder.deliveryStatus}' status`
      });
      return;
    }

    // Restore product stock with error tracking
    const stockUpdateResults = await Promise.allSettled(
      order.items.map(async (item) => {
        const result = await Product.findOneAndUpdate(
          { 
            _id: item.product,
            stock: { $gte: 0 } // Ensure stock doesn't go negative
          },
          { 
            $inc: { stock: item.quantity }
          },
          { 
            new: true,
            runValidators: true
          }
        );
        
        if (!result) {
          throw new Error(`Failed to update stock for product ${item.product}`);
        }
        
        return {
          productId: item.product,
          quantityRestored: item.quantity,
          newStock: result.stock
        };
      })
    );

    // Check for any failed stock updates
    const failedUpdates = stockUpdateResults.filter(result => result.status === 'rejected');
    const successfulUpdates = stockUpdateResults
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    // Log warnings for failed stock updates but don't fail the cancellation
    if (failedUpdates.length > 0) {
      console.warn('Some stock updates failed during order cancellation:', {
        orderId: id,
        failedUpdates: failedUpdates.map(f => (f as PromiseRejectedResult).reason.message)
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order,
        stockUpdates: {
          successful: successfulUpdates.length,
          failed: failedUpdates.length,
          details: successfulUpdates
        }
      }
    });
    return;

  } catch (error: any) {
    console.error('Error cancelling order:', {
      orderId: req.params.id,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Failed to cancel order due to server error',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
    return;
  }
};



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
      .populate({
        path: 'items.product',
        select: 'name images price discount'
      });

    // Calculate statistics with discount consideration
    const orderStats = await Order.aggregate([
      { $match: { ...filter, paymentStatus: PaymentStatus.COMPLETED } },
      { $group: { 
        _id: null, 
        totalRevenue: { $sum: "$totalAmount" },
        totalDiscount: {
          $sum: {
            $reduce: {
              input: "$items",
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  {
                    $multiply: [
                      { $subtract: ["$$this.price", { $ifNull: ["$$this.finalPrice", "$$this.price"] }] },
                      "$$this.quantity"
                    ]
                  }
                ]
              }
            }
          }
        }
      }}
    ]);

    const totalOrders = await Order.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: orders,
      statistics: {
        totalRevenue: orderStats.length ? orderStats[0].totalRevenue : 0,
        totalDiscount: orderStats.length ? orderStats[0].totalDiscount : 0
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / limitNum),
        totalItems: totalOrders,
        limit: limitNum
      }
    });
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

