import { Request, Response } from 'express';
import { Wishlist, IWishlistItem } from '../models/wishlist';
import { Cart } from '../models/cart';
import { Product } from '../models/product';
import { Types } from 'mongoose';

// Get user wishlist
export const getWishlist = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({
        userId,
        items: []
      });
      await wishlist.save();
    }

    // Populate product details
    await wishlist.populateProducts();

    res.status(200).json({
      success: true,
      data: wishlist
    });
  } catch (error: any) {
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
    console.log(req.body);
    const { productId, variantId } = req.body;
    
    console.log('Adding item to wishlist:', { productId, variantId });
    if (!productId) {
      res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
      return;
    }

    // Find the product
    const product = await Product.findById(productId);
    console.log('Found product:', product);
    if (!product) {
      res.status(400).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

     if (!productId || !Types.ObjectId.isValid(productId)) {
      res.status(400).json({
        success: false,
        message: 'Valid Product ID is required'
      });
      return;
    }


    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({
        userId,
        items: []
      });
    }


    // Check if item already exists in wishlist
    const itemExists = wishlist.items.some(item => {
     if (!item || !item.product) {
        return false;
      }

      try {
        const itemProductId = item.product.toString();
        
        // If product IDs don't match, it's not the same item
        if (itemProductId !== productId) {
          return false;
        }

        // For non-variant products
        if (!variantId) {
          return !item.variantId;
        }

        // For variant products
        return item.variantId && item.variantId.toString() === variantId;
      } catch (err) {
        console.error('Error comparing products:', err);
        return false;
      }
    });

    if (itemExists) {
      res.status(400).json({
        success: false,
        message: 'Item already in wishlist'
      });
      return;
    }
    let variant;
    if (variantId && product.hasVariants) {
      variant = product.variants?.find(v => v._id?.toString() === variantId);
      if (!variant) {
        res.status(400).json({
          success: false,
          message: 'Variant not found'
        });
      }
    }
    // Create new wishlist item
    const newItem:IWishlistItem = {
      product:new Types.ObjectId(String(productId)), // Explicitly create ObjectId
      name: product.name,
      price: variant?.price || product.price,
      discount: product.discount,
      finalPrice:0,
      image: product.images[0],
      addedAt: new Date()
    };

    // Add variant details if present
  if (variant) {
      newItem.variantId = variantId;
      newItem.color = variant.color;
      newItem.size = variant.size;
      newItem.sku = variant.sku;
    }

    wishlist.items=[...wishlist.items, newItem];
    await wishlist.save();
    await wishlist.populateProducts();

    res.status(200).json({
      success: true,
      message: 'Item added to wishlist',
      data: wishlist
    });
  } catch (error: any) {
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
    const { variantId } = req.query;
    console.log('Removing item from wishlist:', { productId, variantId });
    const wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
      return;
    }

    // Find item index in wishlist
    const itemIndex = wishlist.items.findIndex(item =>
      item.product.toString() === productId &&
      (!variantId || item.variantId?.toString() === variantId)
    );

    if (itemIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
      return;
    }

    // Remove item from wishlist
    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();
    await wishlist.populateProducts();

    res.status(200).json({
      success: true,
      message: 'Item removed from wishlist',
      data: wishlist
    });
  } catch (error: any) {
    console.error('Error removing item from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from wishlist',
      error: error.message
    });
  }
};

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
  } catch (error: any) {
    console.error('Error clearing wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear wishlist',
      error: error.message
    });
  }
};

// Move item to cart
export const moveToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { variantId, quantity = 1 } = req.body;

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
    const wishlistItem = wishlist.items.find(item =>
      item.product.toString() === productId &&
      (!variantId || item.variantId?.toString() === variantId)
    );

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
        items: []
      });
    }

    // Check if item already exists in cart
    const cartItemIndex = cart.items.findIndex(item =>
      item.product.toString() === productId &&
      (!variantId || item.variantId?.toString() === variantId)
    );

    if (cartItemIndex > -1) {
      // Update existing item quantity
      cart.items[cartItemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      cart.items.push({
        product: wishlistItem.product,
        variantId: wishlistItem.variantId,
        name: wishlistItem.name,
        price: wishlistItem.price,
        discount: wishlistItem.discount,
        quantity,
        image: wishlistItem.image,
        color: wishlistItem.color,
        size: wishlistItem.size,
        sku: wishlistItem.sku
      });
    }

    // Remove item from wishlist
    wishlist.items = wishlist.items.filter(item =>
      !(item.product.toString() === productId &&
        (!variantId || item.variantId?.toString() === variantId))
    );

    // Save both documents
    await Promise.all([
      cart.save(),
      wishlist.save()
    ]);

    // Populate product details
    await Promise.all([
      cart.populateProducts(),
      wishlist.populateProducts()
    ]);

    res.status(200).json({
      success: true,
      message: 'Item moved to cart',
      data: {
        cart,
        wishlist
      }
    });
  } catch (error: any) {
    console.error('Error moving item to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move item to cart',
      error: error.message
    });
  }
};

// Move all items from wishlist to cart
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
        items: []
      });
    }

    // Process each wishlist item
    for (const wishlistItem of wishlist.items) {
      const cartItemIndex = cart.items.findIndex(item => item.product.toString() === wishlistItem.product.toString());

      if (cartItemIndex > -1) {
        // Update existing item quantity
        cart.items[cartItemIndex].quantity += 1;
      } else {
        // Add new item to cart
        cart.items.push({
          product: wishlistItem.product,
          variantId: wishlistItem.variantId,
          name: wishlistItem.name,
          price: wishlistItem.price,
          discount: wishlistItem.discount,
          quantity: 1,
          image: wishlistItem.image,
          color: wishlistItem.color,
          size: wishlistItem.size,
          sku: wishlistItem.sku
        });
      }
    }

    // Clear wishlist
    wishlist.items = [];

    // Save both documents
    await Promise.all([
      cart.save(),
      wishlist.save()
    ]);

    // Populate product details
    await Promise.all([
      cart.populateProducts(),
      wishlist.populateProducts()
    ]);

    res.status(200).json({
      success: true,
      message: 'All items moved to cart',
      data: {
        cart,
        wishlist
      }
    });
  } catch (error: any) {
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

    const inWishlist = wishlist.items.some(item => item.product.toString() === productId);

    res.status(200).json({
      success: true,
      inWishlist
    });
  } catch (error: any) {
    console.error('Error checking wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check wishlist',
      error: error.message
    });
  }
};