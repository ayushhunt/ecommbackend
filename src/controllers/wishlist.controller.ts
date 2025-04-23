import { Request, Response } from 'express';
import Wishlist, { IWishlistItem } from '../models/wishlist';
import {Cart} from '../models/cart';


// Get user wishlist
export const getWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id; // Assuming user ID is available through auth middleware
    
    let wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
      wishlist = new Wishlist({
        userId,
        items: []
      });
      await wishlist.save();
    }
    
    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error:any) {
    console.error('Error getting wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wishlist',
      error: error.message
    });
  }
};

// Add item to wishlist
export const addToWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId, name, price, image } = req.body;
    
    // Validate input
    if (!productId || !name || !price || !image) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
      return;
    }
    
    let wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
      // Create new wishlist if it doesn't exist
      wishlist = new Wishlist({
        userId,
        items: []
      });
      return;
    }
    
    // Check if item already exists in wishlist
    const itemExists = wishlist.items.some(item => item.productId === productId);
    
    if (itemExists) {
      res.status(400).json({
        success: false,
        message: 'Item already in wishlist'
      });
      return;
    }
    
    // Add new item to wishlist
    const newItem: IWishlistItem = {
      productId,
      name,
      price,
      image,
      addedAt: new Date()
    };
    
    wishlist.items.push(newItem);
    await wishlist.save();
    
    res.status(200).json({
      success: true,
      message: 'Item added to wishlist',
      data: wishlist
    });
  } catch (error:any) {
    console.error('Error adding item to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to wishlist',
      error: error.message
    });
  }
};

// Remove item from wishlist
export const removeFromWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    
    const wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
        res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
      return;
    }
    
    // Check if item exists in wishlist
    const itemExists = wishlist.items.some(item => item.productId === productId);
    
    if (!itemExists) {
      res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
      return;
    }
    
    // Remove item from wishlist
    wishlist.items = wishlist.items.filter(item => item.productId !== productId);
    await wishlist.save();
    
    res.status(200).json({
      success: true,
      message: 'Item removed from wishlist',
      data: wishlist
    });
  } catch (error:any) {
    console.error('Error removing item from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from wishlist',
      error: error.message
    });
  }
};

// Clear wishlist
export const clearWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    const wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
      res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
      return;
    }
    
    // Clear wishlist items
    wishlist.items = [];
    await wishlist.save();
    
    res.status(200).json({
      success: true,
      message: 'Wishlist cleared',
      data: wishlist
    });
  } catch (error:any) {
    console.error('Error clearing wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear wishlist',
      error: error.message
    });
  }
};

// Move item from wishlist to cart
export const moveToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity = 1 } = req.body;
    
    // Find wishlist and cart
    const wishlist = await Wishlist.findOne({ userId });
    let cart = await Cart.findOne({ userId });
    
    if (!wishlist) {
      res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
      return;
    }
    
    // Find item in wishlist
    const wishlistItem = wishlist.items.find(item => item.productId === productId);
    
    if (!wishlistItem) {
      res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
      return;
    }
    
    // Create cart if it doesn't exist
    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalPrice: 0
      });
    }
    
    // Check if item already exists in cart
    const cartItemIndex = cart.items.findIndex(item => item.productId === productId);
    
    if (cartItemIndex > -1) {
      // Update existing item quantity
      cart.items[cartItemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      cart.items.push({
        productId: wishlistItem.productId,
        name: wishlistItem.name,
        price: wishlistItem.price,
        quantity,
        image: wishlistItem.image
      });
    }
    
    // Remove item from wishlist
    wishlist.items = wishlist.items.filter(item => item.productId !== productId);
    
    // Save both documents
    await Promise.all([cart.save(), wishlist.save()]);
    
    res.status(200).json({
      success: true,
      message: 'Item moved to cart',
      data: {
        cart,
        wishlist
      }
    });
  } catch (error:any) {
    console.error('Error moving item to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move item to cart',
      error: error.message
    });
  }
};

// Move all wishlist items to cart
export const moveAllToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Find wishlist and cart
    const wishlist = await Wishlist.findOne({ userId });
    let cart = await Cart.findOne({ userId });
    
    if (!wishlist || wishlist.items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Wishlist is empty'
      });
      return;
    }
    
    // Create cart if it doesn't exist
    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalPrice: 0
      });
    }
    
    // Process each wishlist item
    for (const wishlistItem of wishlist.items) {
      const cartItemIndex = cart.items.findIndex(item => item.productId === wishlistItem.productId);
      
      if (cartItemIndex > -1) {
        // Update existing item quantity
        cart.items[cartItemIndex].quantity += 1;
      } else {
        // Add new item to cart
        cart.items.push({
          productId: wishlistItem.productId,
          name: wishlistItem.name,
          price: wishlistItem.price,
          quantity: 1,
          image: wishlistItem.image
        });
      }
    }
    
    // Clear wishlist
    wishlist.items = [];
    
    // Save both documents
    await Promise.all([cart.save(), wishlist.save()]);
    
    res.status(200).json({
      success: true,
      message: 'All items moved to cart',
      data: {
        cart,
        wishlist
      }
    });
  } catch (error:any) {
    console.error('Error moving all items to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move all items to cart',
      error: error.message
    });
  }
};

// Check if product is in wishlist
export const checkWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    
    const wishlist = await Wishlist.findOne({ userId });
    
    if (!wishlist) {
      res.status(200).json({
        success: true,
        inWishlist: false
      });
      return;
    }
    
    const inWishlist = wishlist.items.some(item => item.productId === productId);
    
    res.status(200).json({
      success: true,
      inWishlist
    });
  } catch (error:any) {
    console.error('Error checking wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check wishlist',
      error: error.message
    });
  }
};