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

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  phoneNumber: z.string().optional(),
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
      from: 'onboarding@resend.dev',
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
            <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0; line-height: 1.5;">
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
      from: `${process.env.APP_NAME} <hello@${process.env.RESEND_DOMAIN}>`,
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




// // Request email verification
// export const emailVerification = async (req:Request, res:Response) => {
//   try {
//     const userId = req.user.id;
    
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//     });
    
//     if (!user) {
//       res.status(404).json({ message: 'User not found' });
//       return;
//     }
    
//     if (user.verified) {
//       res.status(400).json({ message: 'Email already verified' });
//       return;
//     }
//     // Generate verification token
//     const token = randomBytes(32).toString('hex');
//     const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
//     await prisma.verification.create({
//       data: {
//         token,
//         type: 'EMAIL',
//         expiresAt,
//         userId,
//       },
//     });
    
//     // Here you would send verification email with token
//     // sendVerificationEmail(user.email, token);
    
//     res.status(200).json({ message: 'Verification email sent' });
//   } catch (error) {
//     console.error('Error requesting email verification:', error);
//     res.status(500).json({ message: 'Failed to request email verification' });
//   }
// };

// // Verify email with token
// export const emailVerificationToken =  async (req:Request, res:Response) => {
//   try {
//     const { token } = req.params;
    
//     const verification = await prisma.verification.findFirst({
//       where: {
//         token,
//         type: 'EMAIL',
//         expiresAt: { gt: new Date() },
//       },
//       include: { user: true },
//     });
    
//     if (!verification) {
//       res.status(400).json({ message: 'Invalid or expired token' });
//       return;
//     }
    
//     await prisma.user.update({
//       where: { id: verification.userId },
//       data: { verified: true },
//     });
    
//     await prisma.verification.delete({
//       where: { id: verification.id },
//     });
    
//     res.status(200).json({ message: 'Email verified successfully' });
//   } catch (error) {
//     console.error('Error verifying email:', error);
//     res.status(500).json({ message: 'Failed to verify email' });
//   }
// };

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
    
    const { street, city, state,phoneNumber, zip } = validationResult.data;
    
    const newAddress = await prisma.address.create({
      data: {
        street,
        city,
        state,
        phoneNumber,
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
    
    const { street, city, state,phoneNumber, zip } = validationResult.data;
    
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
        phoneNumber,
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

