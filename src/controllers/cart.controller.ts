import { Request, Response } from 'express';
import  {Cart, ICartItem } from '../models/cart';
import { Product } from '../models/product';
import { DeliveryStatus, Order, PaymentStatus } from '../models/order';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';


// Get user cart
export const getCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id; // Assuming user ID is available through auth middleware
    
    let cart = await Cart.findOne({ userId });
    
    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalPrice: 0
      });
      await cart.save();
    }
    
    res.status(200).json({
      success: true,
      data: cart
    });
  } catch (error:any) {
    console.error('Error getting cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cart',
      error: error.message
    });
  }
};

// Add item to cart
export const addItemsToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const products: ICartItem[] = req.body.products; // Expecting array of products

    // Validate input
    if (!Array.isArray(products) || products.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Products array is required and should not be empty'
      });
      return;
    }
    for (const product of products) {
      const { productId, name, price, image,quantity } = product;
      if (!productId || !name || !price || !image || !quantity) {
        res.status(400).json({
          success: false,
          message: 'Each product must include productId, name, price, and image'
        });
        return;
      }
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalPrice: 0
      });
    }

    for (const product of products) {
      const { productId, name, price, quantity = 1, image } = product;
      const itemIndex = cart.items.findIndex(item => item.productId === productId);

      if (itemIndex > -1) {
        cart.items[itemIndex].quantity += quantity;
      } else {
        cart.items.push({
          productId,
          name,
          price,
          quantity,
          image
        });
      }
    }

    await cart.save();

    res.status(200).json({
      success: true,
      message: 'Items added to cart',
      data: cart
    });

  } catch (error: any) {
    console.error('Error adding items to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add items to cart',
      error: error.message
    });
  }
};


// Update cart item quantity
export const updateCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity } = req.body;
    // Validate input
    if (!productId || !quantity || quantity < 1) {
      res.status(400).json({
        success: false,
        message: 'Invalid product ID or quantity'
      });
      return;
    }
    
    const cart = await Cart.findOne({ userId });
    
    if (!cart) {
      res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
      return;
    }
    
    const itemIndex = cart.items.findIndex(item => item.productId === productId);
    
    if (itemIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
      return;
    }
    
    // Update item quantity
    cart.items[itemIndex].quantity = quantity;
    await cart.save();
    
    res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: cart
    });
  } catch (error:any) {
    console.error('Error updating cart item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: error.message
    });
  }
};

// Remove item from cart
export const removeCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
  
    // Validate productId
    if (!productId) {
      res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
      return;
    }

    const cart = await Cart.findOne({ userId });
    
    if (!cart) {
      res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
      return;
    }

    // Check if item exists in cart
    const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    
    if (itemIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
      return;
    }

    // Remove item from cart
    cart.items.splice(itemIndex, 1); 

    await cart.save();
    
    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: cart
    });
  } catch (error:any) {
    console.error('Error removing cart item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove cart item',
      error: error.message
    });
  }
};

// Clear cart
export const clearCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    const cart = await Cart.findOne({ userId });
    
    if (!cart) {
      res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
      return;
    }
    
    // Clear cart items
    cart.items = [];
    await cart.save();
    
    res.status(200).json({
      success: true,
      message: 'Cart cleared',
      data: cart
    });
  } catch (error:any) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
};

// Checkout cart (create order from cart)

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_KEY_SECRET as string
});

export const initiateCheckout = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id; 
    const { shippingAddress, paymentMethod } = req.body;
    // Validate input
    if (!shippingAddress || !paymentMethod) {
      res.status(400).json({
        success: false,
        message: 'Shipping address and payment method are required'
      });
      return;
    }
    
    // Get cart items
    const cart = await Cart.findOne({ userId });
    
    if (!cart || !cart.items || cart.items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
      return;
    }
    
    // Fetch product details and calculate total amount
    const orderItems = [];
    let totalAmount = 0;
    
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      console.log('product', product);
      if (!product) {
        res.status(400).json({
          success: false,
          message: `Product not found: ${item.productId}`
        });
        return;
      }
      
      // Check stock availability
      if (product.stock < item.quantity) {
        res.status(400).json({
          success: false,
          message: `Insufficient stock for product: ${product.name}`
        });
        return;
      }
      
      const itemPrice = product.price * item.quantity;
      totalAmount += itemPrice;
      
      orderItems.push({
        product: item.productId,
        quantity: item.quantity,
        price: product.price,
        name: product.name,
        image: product.images[0]
      });
    }
    const timestamp = Date.now().toString().slice(-8); // Use last 8 digits of timestamp
    const userIdPrefix = userId.toString().slice(0, 6); // Use first 6 chars of userId
    const receipt = `rcpt_${userIdPrefix}_${timestamp}`; 
    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId
      }
    });
    // Create order in database
    const order = new Order({
      user: userId,
      items: orderItems,
      totalAmount,
      paymentMethod,
      paymentStatus: PaymentStatus.PENDING,
      deliveryStatus: DeliveryStatus.PENDING,
      razorpayOrderId: razorpayOrder.id,
      shippingAddress
    });
    
    await order.save();
    
    // Return data to client
    res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error: any) {
    console.error('Error initiating checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate checkout',
      error: error.message
    });
  }
};



// Verify Razorpay payment after checkout
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const {
      orderId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    } = req.body;
    
    // Find the order
    const order = await Order.findById(orderId);
    
    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }
    
    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET as string);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');
    
    if (generatedSignature !== razorpay_signature) {
      // Update order status to failed
      order.paymentStatus = PaymentStatus.FAILED;
      await order.save();
      
      res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
      return;
    }
    
    // Update order with payment information
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.paymentStatus = PaymentStatus.COMPLETED;
    order.deliveryStatus = DeliveryStatus.PROCESSING;
    order.transactionId = razorpay_payment_id;
    await order.save();
    
    // Update product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity }
      });
    }
    
    // Clear the cart
    await Cart.findOneAndUpdate({ userId: order.user }, {
      $set: { items: [], totalAmount: 0 }
    });
    
    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order._id,
        paymentId: razorpay_payment_id
      }
    });
  } catch (error: any) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};