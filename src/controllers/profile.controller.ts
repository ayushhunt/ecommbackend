// src/routes/profile.ts
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { randomBytes } from 'crypto';
import { z } from 'zod';


// Validation schemas
const updateUserSchema = z.object({
  name: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional(),
});

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
});

// Get user profile
export const getProfile =  async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        verified: true,
        provider: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
};

// Update user profile
export const updateProfile =  async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    
    const validationResult = updateUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Invalid input data', 
        errors: validationResult.error.issues 
      });
    }
    
    const { name, phoneNumber, email } = validationResult.data;
    
    // If trying to update email, check if it's already taken
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      
      if (existingUser && existingUser.id !== userId) {
        res.status(400).json({ message: 'Email already in use' });
        return;
      }
      
      // If changing email, set verified to false
      if (existingUser && email !== existingUser.email) {
        await prisma.user.update({
          where: { id: userId },
          data: { verified: false },
        });
        
        // Here you would send new verification email
        // sendVerificationEmail(userId, email);
      }
    }
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phoneNumber,
        email,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        verified: true,
      },
    });
    
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Failed to update user profile' });
  }
};

// Request email verification
export const emailVerification = async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    
    if (user.verified) {
      res.status(400).json({ message: 'Email already verified' });
      return;
    }
    // Generate verification token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await prisma.verification.create({
      data: {
        token,
        type: 'EMAIL',
        expiresAt,
        userId,
      },
    });
    
    // Here you would send verification email with token
    // sendVerificationEmail(user.email, token);
    
    res.status(200).json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Error requesting email verification:', error);
    res.status(500).json({ message: 'Failed to request email verification' });
  }
};

// Verify email with token
export const emailVerificationToken =  async (req:Request, res:Response) => {
  try {
    const { token } = req.params;
    
    const verification = await prisma.verification.findFirst({
      where: {
        token,
        type: 'EMAIL',
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    
    if (!verification) {
      res.status(400).json({ message: 'Invalid or expired token' });
      return;
    }
    
    await prisma.user.update({
      where: { id: verification.userId },
      data: { verified: true },
    });
    
    await prisma.verification.delete({
      where: { id: verification.id },
    });
    
    res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ message: 'Failed to verify email' });
  }
};

// --- Address CRUD operations ---

// Get all addresses for the user
export const getAddress =  async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    
    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    
    res.status(200).json(addresses);
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ message: 'Failed to fetch addresses' });
  }
};

// Get a specific address
export const getAddressById = async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    const address = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });
    
    if (!address) {
      res.status(404).json({ message: 'Address not found' });
      return;
    }
    
    res.status(200).json(address);
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({ message: 'Failed to fetch address' });
  }
};

// Create a new address
export const addAddress = async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    
    const validationResult = addressSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        message: 'Invalid input data', 
        errors: validationResult.error.issues 
      });
      return;
    }
    
    const { street, city, state, zip } = validationResult.data;
    
    const newAddress = await prisma.address.create({
      data: {
        street,
        city,
        state,
        zip,
        userId,
      },
    });
    
    res.status(201).json(newAddress);
  } catch (error) {
    console.error('Error creating address:', error);
    res.status(500).json({ message: 'Failed to create address' });
  }
};

// Update an address
export const updateAddress =  async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    const validationResult = addressSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        message: 'Invalid input data', 
        errors: validationResult.error.issues 
      });
      return;
    }
    
    const { street, city, state, zip } = validationResult.data;
    
    // Check if address exists and belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });
    
    if (!existingAddress) {
      res.status(404).json({ message: 'Address not found' });
      return;
    }
    
    const updatedAddress = await prisma.address.update({
      where: { id: addressId },
      data: {
        street,
        city,
        state,
        zip,
        updatedAt: new Date(),
      },
    });
    
    res.status(200).json(updatedAddress);
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ message: 'Failed to update address' });
  }
};

// Delete an address
export const deleteAddress =  async (req:Request, res:Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    // Check if address exists and belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });
    
    if (!existingAddress) {
      res.status(404).json({ message: 'Address not found' });
      return;
    }
    
    await prisma.address.delete({
      where: { id: addressId },
    });
    
    res.status(200).json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({ message: 'Failed to delete address' });
  }
};

