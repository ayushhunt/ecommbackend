import { Request, Response } from 'express';
import  {Cart, ICartItem } from '../models/cart';

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
export const addItemToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId, name, price, quantity = 1, image } = req.body;
    
    // Validate input
    if (!productId || !name || !price || !image) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
      return;
    }
    
    let cart = await Cart.findOne({ userId });
    
    if (!cart) {
      // Create new cart if it doesn't exist
      cart = new Cart({
        userId,
        items: [],
        totalPrice: 0
      });
    }
    
    // Check if item already exists in cart
    const itemIndex = cart.items.findIndex(item => item.productId === productId);
    
    if (itemIndex > -1) {
      // Update existing item quantity
      cart.items[itemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      const newItem: ICartItem = {
        productId,
        name,
        price,
        quantity,
        image
      };
      
      cart.items.push(newItem);
    }
    
    await cart.save();
    
    res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: cart
    });
  } catch (error:any) {
    console.error('Error adding item to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
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
    
    const cart = await Cart.findOne({ userId });
    
    if (!cart) {
      res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
      return;
    }
    
    // Remove item from cart
    cart.items = cart.items.filter(item => item.productId !== productId);
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
export const checkoutCart = async (req: Request, res: Response) => {
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
    
    const cart = await Cart.findOne({ userId });
    
    if (!cart || cart.items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
      return;
    }
    
    // Here you would typically:
    // 1. Create a new order using the cart data
    // 2. Process payment
    // 3. Clear the cart
    
    // For this example, we'll just return the cart data that would be used to create an order
    const orderData = {
      userId,
      items: cart.items,
      totalPrice: cart.totalPrice,
      shippingAddress,
      paymentMethod,
      status: 'pending'
    };
    
    // Clear the cart after checkout
    cart.items = [];
    await cart.save();
    
    res.status(200).json({
      success: true,
      message: 'Checkout successful',
      data: orderData
    });
  } catch (error:any) {
    console.error('Error during checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Checkout failed',
      error: error.message
    });
  }
};

