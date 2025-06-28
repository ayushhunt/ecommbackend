// src/routes/profile.ts
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Resend } from 'resend';


// Validation schemas
const updateUserSchema = z.object({
  name: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional(),
});


// Define the country rules type
interface CountryRule {
  requiresState: boolean;
  requiresPostalCode: boolean;
  postalCodePattern: RegExp;
  stateLabel?: string;
  postalCodeLabel?: string;
}

// Define supported country codes
type CountryCode = 'IN' | 'US' | 'GB' | 'CA' | 'AU';

// Define the address type for validation
interface AddressData {
  name?: string;
  addressType?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  phoneNumber?: string;
  neighborhood?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
}

// Fixed validation function (synchronous)
const validateAddressByCountry = (address: AddressData, country: string): boolean => {
  const countryRules: Record<CountryCode, CountryRule> = {
    'IN': {
      requiresState: true,
      requiresPostalCode: true,
      postalCodePattern: /^\d{6}$/,
      stateLabel: 'State',
      postalCodeLabel: 'PIN Code'
    },
    'US': {
      requiresState: true,
      requiresPostalCode: true,
      postalCodePattern: /^\d{5}(-\d{4})?$/,
      stateLabel: 'State',
      postalCodeLabel: 'ZIP Code'
    },
    'GB': {
      requiresState: false,
      requiresPostalCode: true,
      postalCodePattern: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
      stateLabel: 'County',
      postalCodeLabel: 'Postal Code'
    },
    'CA': {
      requiresState: true,
      requiresPostalCode: true,
      postalCodePattern: /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i,
      stateLabel: 'Province',
      postalCodeLabel: 'Postal Code'
    },
    'AU': {
      requiresState: true,
      requiresPostalCode: true,
      postalCodePattern: /^\d{4}$/,
      stateLabel: 'State',
      postalCodeLabel: 'Postcode'
    }
  };

  // Check if country is supported
  if (!Object.keys(countryRules).includes(country)) {
    return true; // Allow unsupported countries (no validation)
  }

  const rules = countryRules[country as CountryCode];

  // Validate state requirement
  if (rules.requiresState && !address.state?.trim()) {
    throw new Error(`${rules.stateLabel || 'State'} is required for this country`);
  }

  // Validate postal code requirement
  if (rules.requiresPostalCode && !address.postalCode?.trim()) {
    throw new Error(`${rules.postalCodeLabel || 'Postal code'} is required for this country`);
  }

  // Validate postal code format
  if (address.postalCode && !rules.postalCodePattern.test(address.postalCode.trim())) {
    throw new Error(`Invalid ${rules.postalCodeLabel?.toLowerCase() || 'postal code'} format for this country`);
  }

  return true;
};


// Updated address schema with proper typing
const addressSchema = z.object({
  name: z.string().optional(),
  addressType: z.enum(['HOME', 'OFFICE', 'FRIEND', 'FAMILY', 'BUSINESS', 'OTHER']).default('HOME'),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  landmark: z.string().optional(),
  phoneNumber: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().length(2, 'Country must be 2-letter ISO code').default('IN'),
  deliveryInstructions: z.string().optional(),
  isDefault: z.boolean().optional(),
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
      res.status(400).json({ 
        message: 'Invalid input data', 
        errors: validationResult.error.issues 
      });
      return;
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








// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Send verification email function using Resend
export const sendVerificationEmail = async (email: string, token: string) => {
  try {
    // Construct verification URL
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    
    const { data, error } = await resend.emails.send({
      from:  process.env.FROM_EMAIL || 'noreply@yourdomain.com',
      to: [email],
      subject: 'Verify Your Email Address',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #1a1a1a; font-size: 32px; font-weight: 700; margin: 0 0 16px 0;">
              Verify Your Email
            </h1>
            <p style="color: #6b7280; font-size: 18px; margin: 0; line-height: 1.5;">
              Complete your registration by verifying your email address
            </p>
          </div>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      border-radius: 16px; padding: 40px; text-align: center; margin-bottom: 32px;">
            <p style="color: white; font-size: 16px; margin: 0 0 24px 0; opacity: 0.9;">
              Click the button below to verify your email address and activate your account.
            </p>
            
            <a href="${verificationUrl}" 
               style="display: inline-block; background: white; color: #667eea; 
                      padding: 16px 32px; text-decoration: none; border-radius: 8px; 
                      font-weight: 600; font-size: 16px; transition: all 0.2s;">
              Verify Email Address
            </a>
          </div>
          
          <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 12px 0; font-weight: 600;">
              Alternative verification link:
            </p>
            <p style="margin: 0;">
              <a href="${verificationUrl}" 
                 style="color: #667eea; font-size: 14px; word-break: break-all; text-decoration: none;">
                ${verificationUrl}
              </a>
            </p>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
            <p style="color: #9ca3af; font-size: 13px; text-align: center, margin: 0; line-height: 1.5;">
              This verification link expires in 24 hours.<br>
              If you didn't create an account, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
      text: `
Verify Your Email Address

Complete your registration by verifying your email address.

Verification link: ${verificationUrl}

This link will expire in 24 hours.
If you didn't create an account, you can safely ignore this email.
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('Verification email sent successfully:', data?.id);
    return data;
    
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Optional: Send welcome email after verification
export const sendWelcomeEmail = async (email: string, name: string) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
      to: [email],
      subject: `Welcome to ${process.env.APP_NAME}!`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #1a1a1a; font-size: 32px; font-weight: 700; margin: 0 0 8px 0;">
              Welcome, ${name}! 🎉
            </h1>
            <p style="color: #6b7280; font-size: 18px; margin: 0;">
              Your account has been successfully verified
            </p>
          </div>
          
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                      border-radius: 16px; padding: 40px; text-align: center; margin-bottom: 32px;">
            <p style="color: white; font-size: 16px; margin: 0 0 24px 0;">
              You're all set! Start exploring everything we have to offer.
            </p>
            
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="display: inline-block; background: white; color: #059669; 
                      padding: 16px 32px; text-decoration: none; border-radius: 8px; 
                      font-weight: 600; font-size: 16px;">
              Get Started
            </a>
          </div>
          
          <div style="text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 0;">
              Need help? Reply to this email or contact our support team.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Welcome email error:', error);
      // Don't throw here - welcome email failure shouldn't break verification
    }

    return data;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    // Non-critical error
  }
};

// Updated email verification function
export const emailVerification = async (req: Request, res: Response) => {
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
    
    // Check for existing verification (prevent spam)
    const existingVerification = await prisma.verification.findFirst({
      where: {
        userId,
        type: 'EMAIL',
        expiresAt: { gt: new Date() },
      },
    });
    
    let token: string;
    
    if (existingVerification) {
      // Use existing token if created within last 5 minutes (prevent spam)
      const fiveMinutesAgo = new Date(Date.now() - 1000);
      if (existingVerification.createdAt > fiveMinutesAgo) {
        res.status(429).json({ 
          message: 'Verification email already sent. Please wait before requesting another.' 
        });
        return;
      }
      token = existingVerification.token;
    } else {
      // Generate new verification token
      token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await prisma.verification.create({
        data: {
          token,
          type: 'EMAIL',
          expiresAt,
          userId,
        },
      });
    }
    
    // Send verification email
    await sendVerificationEmail(user.email, token);
    
    res.status(200).json({ 
      message: 'Verification email sent successfully',
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Partially hide email
    });
    
  } catch (error) {
    console.error('Error requesting email verification:', error);
    res.status(500).json({ message: 'Failed to request email verification' });
  }
};

// Updated email verification token function with welcome email
export const emailVerificationToken = async (req: Request, res: Response) => {
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
      res.status(400).json({ message: 'Invalid or expired verification token' });
      return;
    }
    
    // Update user as verified
    await prisma.user.update({
      where: { id: verification.userId },
      data: { 
        verified: true
      },
    });
    
    // Clean up verification token
    await prisma.verification.delete({
      where: { id: verification.id },
    });
    
    // Send welcome email (optional)
    try {
      await sendWelcomeEmail(verification.user.email, verification.user.name || 'there');
    } catch (error) {
      console.log('Welcome email failed, but verification succeeded');
    }
    
    res.status(200).json({ 
      message: 'Email verified successfully',
      user: {
        email: verification.user.email,
        verified: true,
      }
    });
    
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ message: 'Failed to verify email' });
  }
};





// --- Address CRUD operations ---



// Get all addresses for the user (only active addresses)
export const getAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    const addresses = await prisma.address.findMany({
      where: { 
        userId,
        isActive: true // Only return active addresses
      },
      orderBy: [
        { isDefault: 'desc' }, // Default address first
        { createdAt: 'desc' }
      ],
    });
    
    res.status(200).json({
      success: true,
      data: addresses
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch addresses' 
    });
  }
};

// Get a specific address (only if active)
export const getAddressById = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    const address = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
        isActive: true // Only return if active
      },
    });
    
    if (!address) {
      res.status(404).json({ 
        success: false,
        message: 'Address not found' 
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch address' 
    });
  }
};

// Create a new address
export const addAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    const validationResult = addressSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid input data', 
        errors: validationResult.error.issues 
      });
      return;
    }
    
    const {
      name,
      addressType,
      addressLine1,
      addressLine2,
      landmark,
      phoneNumber,
      neighborhood,
      city,
      state = null,
      postalCode,
      country,
      deliveryInstructions,
      isDefault = false
    } = validationResult.data;
    
    // Country-specific validation (removed await)
    validateAddressByCountry(validationResult.data, country);
    
    // Check if this is the user's first active address
    const existingAddressCount = await prisma.address.count({
      where: { 
        userId,
        isActive: true 
      }
    });
    
    const shouldBeDefault = isDefault || existingAddressCount === 0;
    
    // If setting as default or if it's the first address, handle transaction
    if (shouldBeDefault) {
      const result = await prisma.$transaction(async (tx) => {
        // Remove default from all user addresses if setting this as default
        if (existingAddressCount > 0) {
          await tx.address.updateMany({
            where: { 
              userId,
              isActive: true 
            },
            data: { isDefault: false }
          });
        }
        
        // Create new address
        return await tx.address.create({
          data: {
            name,
            addressType,
            addressLine1,
            addressLine2,
            landmark,
            phoneNumber,
            neighborhood,
            city,
            state,
            postalCode,
            country,
            deliveryInstructions,
            isDefault: true, // Set as default
            isActive: true,
            userId,
          },
        });
      });
      
      res.status(201).json({
        success: true,
        message: 'Address created successfully',
        data: result
      });
    } else {
      // Create normal address (not default)
      const newAddress = await prisma.address.create({
        data: {
          name,
          addressType,
          addressLine1,
          addressLine2,
          landmark,
          phoneNumber,
          neighborhood,
          city,
          state,
          postalCode,
          country,
          deliveryInstructions,
          isDefault: false,
          isActive: true,
          userId,
        },
      });
      
      res.status(201).json({
        success: true,
        message: 'Address created successfully',
        data: newAddress
      });
    }
  } catch (error: any) {
    console.error('Error creating address:', error);
    if (error.message.includes('required for this country') || error.message.includes('Invalid')) {
      res.status(400).json({ 
        success: false,
        message: error.message 
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: 'Failed to create address' 
      });
    }
  }
};


// Update an address
export const updateAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    const validationResult = addressSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid input data', 
        errors: validationResult.error.issues 
      });
      return;
    }
    
    const {
      name,
      addressType,
      addressLine1,
      addressLine2,
      landmark,
      phoneNumber,
      neighborhood,
      city,
      state,
      postalCode,
      country,
      deliveryInstructions,
      isDefault = false
    } = validationResult.data;
    
    // Check if address exists, belongs to user, and is active
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
        isActive: true
      },
    });
    
    if (!existingAddress) {
      res.status(404).json({ 
        success: false,
        message: 'Address not found' 
      });
      return;
    }
    
    // Country-specific validation (removed await)
    validateAddressByCountry(validationResult.data, country);
    
    // If setting as default, handle transaction
    if (isDefault && !existingAddress.isDefault) {
      const result = await prisma.$transaction(async (tx) => {
        // Remove default from all user addresses
        await tx.address.updateMany({
          where: { 
            userId,
            isActive: true 
          },
          data: { isDefault: false }
        });
        
        // Update this address
        return await tx.address.update({
          where: { id: addressId },
          data: {
            name,
            addressType,
            addressLine1,
            addressLine2,
            landmark,
            phoneNumber,
            neighborhood,
            city,
            state,
            postalCode,
            country,
            deliveryInstructions,
            isDefault: true,
            updatedAt: new Date(),
          },
        });
      });
      
      res.status(200).json({
        success: true,
        message: 'Address updated successfully',
        data: result
      });
    } else {
      // Normal update without changing default status
      const updatedAddress = await prisma.address.update({
        where: { id: addressId },
        data: {
          name,
          addressType,
          addressLine1,
          addressLine2,
          landmark,
          phoneNumber,
          neighborhood,
          city,
          state,
          postalCode,
          country,
          deliveryInstructions,
          isDefault: isDefault || existingAddress.isDefault, // Maintain current default status if not explicitly changing
          updatedAt: new Date(),
        },
      });
      
      res.status(200).json({
        success: true,
        message: 'Address updated successfully',
        data: updatedAddress
      });
    }
  } catch (error: any) {
    console.error('Error updating address:', error);
    if (error.message.includes('required for this country') || error.message.includes('Invalid')) {
      res.status(400).json({ 
        success: false,
        message: error.message 
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: 'Failed to update address' 
      });
    }
  }
};

// Soft delete an address (set isActive to false)
export const deleteAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    // Check if address exists, belongs to user, and is active
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
        isActive: true
      },
    });
    
    if (!existingAddress) {
      res.status(404).json({ 
        success: false,
        message: 'Address not found' 
      });
      return;
    }
    
    // Check if this is the default address
    if (existingAddress.isDefault) {
      // Count other active addresses
      const otherActiveAddresses = await prisma.address.findMany({
        where: {
          userId,
          isActive: true,
          id: { not: addressId }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      if (otherActiveAddresses.length > 0) {
        // Set the most recent address as default before deleting current default
        await prisma.$transaction(async (tx) => {
          // Set another address as default
          await tx.address.update({
            where: { id: otherActiveAddresses[0].id },
            data: { isDefault: true }
          });
          
          // Soft delete the current address
          await tx.address.update({
            where: { id: addressId },
            data: { 
              isActive: false,
              isDefault: false,
              updatedAt: new Date()
            }
          });
        });
      } else {
        // Just soft delete if it's the only address
        await prisma.address.update({
          where: { id: addressId },
          data: { 
            isActive: false,
            isDefault: false,
            updatedAt: new Date()
          }
        });
      }
    } else {
      // Soft delete non-default address
      await prisma.address.update({
        where: { id: addressId },
        data: { 
          isActive: false,
          updatedAt: new Date()
        }
      });
    }
    
    res.status(200).json({ 
      success: true,
      message: 'Address deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete address' 
    });
  }
};

// Set default address (standalone function)
export const setDefaultAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    // Check if address exists, belongs to user, and is active
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
        isActive: true
      },
    });
    
    if (!existingAddress) {
      res.status(404).json({ 
        success: false,
        message: 'Address not found' 
      });
      return;
    }
    
    if (existingAddress.isDefault) {
      res.status(400).json({ 
        success: false,
        message: 'Address is already set as default' 
      });
      return;
    }
    
    // Use transaction to ensure only one default address
    await prisma.$transaction([
      // Remove default from all user addresses
      prisma.address.updateMany({
        where: { 
          userId,
          isActive: true 
        },
        data: { isDefault: false }
      }),
      // Set new default
      prisma.address.update({
        where: { id: addressId },
        data: { isDefault: true }
      })
    ]);
    
    res.status(200).json({ 
      success: true,
      message: 'Default address set successfully' 
    });
  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to set default address' 
    });
  }
};

// Get default address (utility function)
export const getDefaultAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    const defaultAddress = await prisma.address.findFirst({
      where: {
        userId,
        isActive: true,
        isDefault: true
      },
    });
    
    if (!defaultAddress) {
      res.status(404).json({ 
        success: false,
        message: 'No default address found' 
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: defaultAddress
    });
  } catch (error) {
    console.error('Error fetching default address:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch default address' 
    });
  }
};

// Restore a soft-deleted address (optional utility)
export const restoreAddress = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    
    // Check if address exists, belongs to user, and is inactive
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
        isActive: false
      },
    });
    
    if (!existingAddress) {
      res.status(404).json({ 
        success: false,
        message: 'Deleted address not found' 
      });
      return;
    }
    
    const restoredAddress = await prisma.address.update({
      where: { id: addressId },
      data: { 
        isActive: true,
        updatedAt: new Date()
      }
    });
    
    res.status(200).json({ 
      success: true,
      message: 'Address restored successfully',
      data: restoredAddress
    });
  } catch (error) {
    console.error('Error restoring address:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to restore address' 
    });
  }
};

