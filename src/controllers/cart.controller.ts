import { Request, Response } from 'express';
import { Cart, ICartItem } from '../models/cart';
import { Product, IProduct } from '../models/product'; // Add IProduct import
import { DeliveryStatus, Order, PaymentStatus } from '../models/order';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { Types } from 'mongoose'; // Add this import

// Interface for product in request body
interface AddToCartItem {
  product: string | Types.ObjectId; // Accept both string and ObjectId
  variantId?: string | Types.ObjectId;
  quantity: number;
}

// Add these interfaces at the top of the file
interface PopulatedProduct {
  _id: Types.ObjectId;
  name: string;
  images: string[];
  price: number;
  discount: number;
  hasVariants: boolean;
  stock: number;
  variants?: Array<{
    _id: Types.ObjectId;
    color?: string;
    size?: string;
    sku: string;
    price?: number;
    stock: number;
    isActive: boolean;
  }>;
}

interface PopulatedCartItem extends Omit<ICartItem, 'product'> {
  product: PopulatedProduct;
}

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
    const products = req.body.products; // Change type here
    console.log('Adding items to cart:', products);
    // Validate input
    if (!Array.isArray(products) || products.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Products array is required and should not be empty'
      });
      return;
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalPrice: 0
      });
    }

    // Process each product
    for (const item of products) {
      const productId = item.product;
      const variantId = item.variantId ? 
        (typeof item.variantId === 'string' ? item.variantId : item.variantId.toString()) 
        : undefined;
      const quantity = item.quantity;

      // Find product
      const product = await Product.findById(productId);
      if (!product) {
        res.status(400).json({
          success: false,
          message: `Product not found: ${productId}`
        });
        return;
      }

      let variant;
      let price;
      let availableStock;

      if (product.hasVariants) {
        if (!variantId) {
          res.status(400).json({
            success: false,
            message: `Variant ID is required for product: ${product.name}`
          });
          return;
        }

        variant = product.variants?.find(v => v._id?.toString() === variantId);
        if (!variant) {
          res.status(400).json({
            success: false,
            message: `Variant not found for product: ${product.name}`
          });
          return;
        }

        if (!variant.isActive) {
          res.status(400).json({
            success: false,
            message: `Variant is no longer available for: ${product.name}`
          });
          return;
        }

        price = variant.price || product.price;
        availableStock = variant.stock;
      } else {
        if (variantId) {
          res.status(400).json({
            success: false,
            message: `Product ${product.name} does not have variants`
          });
          return;
        }

        price = product.price;
        availableStock = product.stock;
      }

      // Check stock
      if (availableStock < quantity) {
        res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`
        });
        return;
      }

      // Find existing item in cart
      const itemIndex = cart.items.findIndex(i => 
        i.product.toString() === productId &&
        (!variantId || i.variantId?.toString() === variantId)
      );

      // Update the cartItem creation
      const cartItem: ICartItem = {
        product: new Types.ObjectId(productId),
        variantId: variantId ? new Types.ObjectId(variantId) : undefined,
        name: product.name,
        price: price,
        discount: product.discount,
        quantity: quantity,
        image: product.images[0],
        color: variant?.color,
        size: variant?.size,
        sku: variant?.sku
      };

      if (itemIndex > -1) {
        // Update existing item
        cart.items[itemIndex].quantity += quantity;
      } else {
        // Add new item
        cart.items.push(cartItem);
      }
    }

    await cart.save();

    // Populate product details for response
    await cart.populateProducts();

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

// Update cart item
export const updateCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity, variantId } = req.body;

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

    // Find item in cart
    const itemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId &&
      (!variantId || item.variantId?.toString() === variantId)
    );

    if (itemIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
      return;
    }

    // Check stock availability
    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    let availableStock;
    if (product.hasVariants && variantId) {
      const variant = product.variants?.find(v => v._id?.toString() === variantId);
      if (!variant) {
        res.status(404).json({
          success: false,
          message: 'Variant not found'
        });
        return;
      }
      availableStock = variant.stock;
    } else {
      availableStock = product.stock;
    }

    if (availableStock < quantity) {
      res.status(400).json({
        success: false,
        message: `Insufficient stock. Only ${availableStock} available`
      });
      return;
    }

    // Update quantity
    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    // Populate product details for response
    await cart.populateProducts();

    res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: cart
    });
    return;

  } catch (error: any) {
    console.error('Error updating cart item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: error.message
    });
    return;
  }
};

// Remove item from cart
export const removeCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { variantId } = req.query; // Add this to handle variants
  
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

    // Update the item finding logic to include variant
    const itemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId && 
      (!variantId || item.variantId?.toString() === variantId)
    );
    
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
    
    // Populate product details before sending response
    await cart.populateProducts();

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: cart
    });
    return;
  } catch (error: any) {
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
     if (!shippingAddress?.name || shippingAddress.name.trim() === '') {
      shippingAddress.name = 'Home';
    }
    console.log(shippingAddress);
    // Validate input
    if (!shippingAddress || !paymentMethod) {
      res.status(400).json({
        success: false,
        message: 'Shipping address and payment method are required'
      });
      return;
    }
    if (!shippingAddress?.name || shippingAddress.name.trim() === '') {
      shippingAddress.name = 'Home';
    }
    console.log(shippingAddress);
    // Get cart with populated product details
    const cart = await Cart.findOne({ userId }).populate<{ items: PopulatedCartItem[] }>({
      path: 'items.product',
      select: 'name images price discount hasVariants variants'
    });
    
    if (!cart || !cart.items || cart.items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
      return;
    }
    
    // Validate stock and prepare order items
    const orderItems = [];
    let totalAmount = 0;
    
    for (const item of cart.items) {
      const product = item.product;
      
      if (!product) {
        res.status(400).json({
          success: false,
          message: `Product not found: ${item.product}`
        });
        return;
      }

      let variantPrice: number;
      let availableStock: number;
      let selectedVariant;

      if (product.hasVariants) {
        if (!item.variantId) {
          res.status(400).json({
            success: false,
            message: `Variant ID is required for product: ${product.name}`
          });
          return;
        }

        selectedVariant = product.variants?.find(
          v => v._id.toString() === item.variantId?.toString()
        );

        if (!selectedVariant) {
          res.status(400).json({
            success: false,
            message: `Variant not found for product: ${product.name}`
          });
          return;
        }

        if (!selectedVariant.isActive) {
          res.status(400).json({
            success: false,
            message: `Variant is no longer available for: ${product.name}`
          });
          return;
        }

        variantPrice = selectedVariant.price || product.price;
        availableStock = selectedVariant.stock;
      } else {
        if (item.variantId) {
          res.status(400).json({
            success: false,
            message: `Product ${product.name} does not have variants`
          });
          return;
        }

        variantPrice = product.price;
        availableStock = product.stock;
      }

      // Check stock
      if (availableStock < item.quantity) {
        res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`
        });
        return;
      }

      // Calculate prices
      const discount = item.discount || product.discount || 0;
      const finalPrice = variantPrice * (1 - discount / 100);
      const itemTotal = finalPrice * item.quantity;

      orderItems.push({
        product: product._id,
        variantId: selectedVariant ? selectedVariant._id : null,
        quantity: item.quantity,
        price: variantPrice,
        discount,
        finalPrice,
        name: product.name,
        image: item.image,
        color: selectedVariant?.color || null,
        size: selectedVariant?.size || null,
        sku: selectedVariant?.sku || null
      });

      totalAmount += itemTotal;
    }

    // Generate receipt number
    const timestamp = Date.now().toString().slice(-8);
    const userIdPrefix = userId.toString().slice(0, 6);
    const receipt = `rcpt_${userIdPrefix}_${timestamp}`; 

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt,
      notes: { userId }
    });

    // Create order
    const createOrderDto = {
      user: userId,
      items: orderItems,
      totalAmount,
      paymentMethod,
      paymentStatus: PaymentStatus.PENDING,
      deliveryStatus: DeliveryStatus.PENDING,
      razorpayOrderId: razorpayOrder.id,
      shippingAddress
    };

    const order = await Order.create(createOrderDto);
    
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
    return;

  } catch (error: any) {
    console.error('Error initiating checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate checkout',
      error: error.message
    });
    return;
  }
};

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

    // Update product stock atomically
    const stockUpdatePromises = order.items.map(async (item) => {
      const updateQuery = item.variantId 
        ? {
            _id: item.product,
            'variants._id': item.variantId,
            'variants.stock': { $gte: item.quantity }
          }
        : {
            _id: item.product,
            stock: { $gte: item.quantity }
          };

      const updateOperation = item.variantId
        ? {
            $inc: { 'variants.$.stock': -item.quantity },
            $set: { updatedAt: new Date() }
          }
        : {
            $inc: { stock: -item.quantity },
            $set: { updatedAt: new Date() }
          };

      const result = await Product.findOneAndUpdate(
        updateQuery,
        updateOperation,
        { new: true }
      );

      if (!result) {
        throw new Error(`Failed to update stock for product: ${item.product}`);
      }

      return result;
    });

    // Execute all stock updates and save order
    await Promise.all([
      ...stockUpdatePromises,
      order.save(),
      // Clear the cart
      Cart.findOneAndUpdate(
        { userId: order.user },
        { $set: { items: [], totalPrice: 0 } }
      )
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order._id,
        paymentId: razorpay_payment_id
      }
    });
    return;

  } catch (error: any) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
    return;
  }
};