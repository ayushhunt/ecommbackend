// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { JWT_CONFIG, BCRYPT_ROUNDS } from '../config/auth';
import { parse, serialize } from 'cookie';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import crypto from 'crypto';



const resend = new Resend(process.env.RESEND_API_KEY);



interface DecodedToken {
  userId: string;
  [key: string]: any;
}


const googleClientId = process.env.GOOGLE_CLIENT_ID!;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET!; // You'll need this for the callback
const googleRedirectUri = process.env.GOOGLE_CALLBACK_URL!; // Your backend callback URL




export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Basic validation
    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create the user (no address)
    const user = await prisma.user.create({
      data: {
        provider: 'email',
        email,
        name,
        passwordHash: hashedPassword,
        verified: false
      }
    });

    // TODO: Send verification email

    res.status(201).json({ message: 'User created. Please verify your email.', user });
    return;

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Registration failed' });
    return;
  }
};


export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(422).json({ message: 'Please fill in all fields (email and password)' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      res.status(401).json({ message: 'Email or password is invalid' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: 'Email or password is invalid' });
      return;
    }

    // Clear existing refresh tokens for the user (optional for strict SSO)
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    // Create new tokens
    const accessToken = jwt.sign(
      { userId: user.id },
      JWT_CONFIG.accessTokenSecret,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      JWT_CONFIG.refreshTokenSecret,
      { expiresIn: '7d' }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt
      }
    });

    // Set tokens as cookies
    res.setHeader('Set-Cookie', [
      serialize('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && req.protocol === 'https',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60, // 15 minutes
      }),
      serialize('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && req.protocol === 'https',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      })
    ]);

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};


export const refreshToken = async (req: Request, res: Response) => {
  try {
    // Extract refresh token from cookie (or req.body if you prefer that)
    console.log('Request headers:', req.headers.cookie);
  const cookies = parse(req.headers.cookie || '');
  const refreshToken = cookies.refreshToken;
  console.log('Refresh token:', refreshToken);
  if (!refreshToken) {
    res.status(401).json({ message: 'Refresh token not found' });
    return;
  }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_CONFIG.refreshTokenSecret) as DecodedToken;

    // Check if token exists in DB and is not expired
    const userRefreshToken = await prisma.refreshToken.findUnique({
      where: {
        token: refreshToken
      }
    });

    if (
      !userRefreshToken ||
      userRefreshToken.userId !== decoded.userId ||
      userRefreshToken.expiresAt < new Date()
    ) {
      res.status(401).json({ message: 'Refresh token invalid or expired. Please log in again.' });
      return;
    }

    // ✅ If still valid, generate and return new access token only
    const accessToken = jwt.sign(
      { userId: decoded.userId },
      JWT_CONFIG.accessTokenSecret,
      { expiresIn: '1m' }
    );

    // ❌ Do NOT delete or rotate the refresh token
    res.status(200).json({
      accessToken
    });

  } catch (error: any) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Refresh token expired. Please log in again.' });
      return;
    }

    res.status(500).json({ message: error.message });
  }
};




const oAuth2Client = new OAuth2Client(
  googleClientId,
  googleClientSecret,
  googleRedirectUri
);


export const googleAuth= async (req: Request, res: Response) => {
  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // Request a refresh token
    scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    prompt: 'consent', // Ensure the consent screen is shown at least once
  });
  res.redirect(authorizeUrl);
};


export const googleCallback= async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    res.status(400).send('Authorization code not provided.');
    return;
  }

  try {
    // Exchange authorization code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens); // Set credentials for potential future Google API calls

    // Verify the ID token
    const idToken = tokens.id_token;
    if (!idToken) {
      res.status(400).send('ID token not received.');
      return;
    }

    const ticket = await oAuth2Client.verifyIdToken({
      idToken: idToken,
      audience: googleClientId, // Specify the CLIENT_ID of the app that accesses the backend
    });
    const payload: any = ticket.getPayload();

    if (!payload) {
      res.status(400).send('Invalid ID token payload.');
      return;
    }

    const googleUserId = payload.sub; // Google's unique user ID
    const email = payload.email!;
    const name = payload.name;

    // --- User Management ---
    let user = await prisma.user.findUnique({
      where: { email: email },
      include: { RefreshToken: true }
    });

    if (user) {
      // User exists with this email
      if (user.provider === 'email') {
        // Existing email user, link Google account
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            provider: 'google',
            providerId: googleUserId,
            // Optionally update name if it was not set for email users
            name: user.name || name,
            verified: true, // Assume Google verified email
          },
          include: { RefreshToken: true }
        });
        console.log(`Linked Google account for user: ${user.email}`);

      } else if (user.provider === 'google' && user.providerId === googleUserId) {
        // Existing Google user logging in again
        console.log(`Existing Google user logged in: ${user.email}`);
        // No update needed for provider and providerId

      } else {
        // User exists with this email but a different SSO provider
        // Handle this case based on your desired logic (e.g., error or linking)
        console.warn(`User with email ${email} exists but with a different provider: ${user.provider}`);
        res.status(409).send('Account with this email already exists with a different login method.');
        return;
      }

    } else {
      // New user
      user = await prisma.user.create({
        data: {
          provider: 'google',
          providerId: googleUserId,
          email: email,
          name: name,
          verified: true, // Assume Google verified email
          // passwordHash will be null
        },
        include: { RefreshToken: true }
      });
      console.log(`Created new user from Google login: ${user.email}`);
    }

    // --- Token Generation and Storage ---
    const accessToken = jwt.sign(
      { userId: user.id },
      JWT_CONFIG.accessTokenSecret,
      { expiresIn: '15m' }
    );  // Generate your access and refresh tokens
    const existingToken = await prisma.refreshToken.findFirst({
      where: {
        userId: user.id,
        expiresAt: {
          gt: new Date()
        }
      }
    });
    
    let refreshToken: string;
    if (existingToken) {
      refreshToken = existingToken.token;
    } else {
      refreshToken = jwt.sign({ userId: user.id }, JWT_CONFIG.refreshTokenSecret, { expiresIn: '7d' });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt
        }
      });
    }

    // Set HttpOnly refresh token cookie
    res.setHeader('Set-Cookie', serialize('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && req.protocol === 'https',
      sameSite: 'lax',
      path: '/', // your refresh endpoint
      maxAge: 7 * 24 * 60 * 60, // in seconds
    }));
    res.setHeader('Set-Cookie', serialize('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && req.protocol === 'https',
      sameSite: 'lax',
      path: '/', // your refresh endpoint
      maxAge: 15 * 60, // in seconds
    }));
    // --- Response ---
    // Send your application's tokens back to the frontend
    // You might redirect to a frontend page with tokens in query params or body,
    // or set httpOnly cookies. Using httpOnly cookies for refresh tokens is recommended for security.
    res.redirect(`http://localhost:3003/google?accessToken=${accessToken}`);
  } catch (error) {
    console.error('Error during Google authentication callback:', error);
    res.status(500).send('Authentication failed.');
  }
};



export const logout = async (req: Request, res: Response) => {
  try {
    // Get refresh token from cookies
    const cookies = parse(req.headers.cookie || '');
    const refreshToken = cookies.refreshToken;

    if (refreshToken) {
      // Delete refresh token from database
      await prisma.refreshToken.deleteMany({
        where: {
          token: refreshToken
        }
      });
    }

    // Clear cookies by setting them to expire
    res.setHeader('Set-Cookie', [
      serialize('accessToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && req.protocol === 'https',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0), // Immediately expire the cookie
      }),
      serialize('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && req.protocol === 'https',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0), // Immediately expire the cookie
      }),
    ]);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Error during logout' });
  }
};


export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
      return;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ 
      where: { email: email.toLowerCase() } 
    });

    // Always return success for security (don't reveal if email exists)
    if (!user) {
      res.status(200).json({ 
        success: true,
        message: 'If an account with that email exists, we\'ve sent a password reset link.' 
      });
      return;
    }

    // Only allow password reset for email providers
    if (user.provider !== 'email') {
      res.status(400).json({ 
        success: false,
        message: `This account was created with ${user.provider}. Please use ${user.provider} to sign in.` 
      });
      return;
    }

    // Invalidate any existing password reset tokens
    await prisma.passwordReset.updateMany({
      where: { email: email.toLowerCase() },
      data: { used: true }
    });

    // Generate secure token and OTP
    const resetToken = crypto.randomBytes(32).toString('hex');
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create password reset record
    await prisma.passwordReset.create({
      data: {
        email: email.toLowerCase(),
        token: resetToken,
        otp,
        expiresAt,
        used: false
      }
    });

    // Send email with both token and OTP
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
        to: email,
        subject: 'Reset Your Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Reset Your Password</h2>
            <p>Hello ${user.name || 'there'},</p>
            <p>We received a request to reset your password. You can reset it using either method below:</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Method 1: Click the link</h3>
              <p>Click the button below to reset your password:</p>
              <a href="${resetUrl}" 
                 style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </div>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Method 2: Use OTP</h3>
              <p>Or use this 6-digit code:</p>
              <div style="font-size: 24px; font-weight: bold; color: #007bff; letter-spacing: 4px; text-align: center; padding: 10px; background: white; border-radius: 4px;">
                ${otp}
              </div>
            </div>

            <p style="color: #666; font-size: 14px;">
              This link and OTP will expire in 15 minutes. If you didn't request this, please ignore this email.
            </p>
            
            <p style="color: #666; font-size: 12px;">
              If the button doesn't work, copy and paste this link: ${resetUrl}
            </p>
          </div>
        `
      });

      res.status(200).json({ 
        success: true,
        message: 'Password reset instructions sent to your email.' 
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({ 
        success: false,
        message: 'Failed to send email. Please try again.' 
      });
    }

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};


export const verifyResetToken = async (req: Request, res: Response) => {
  try {
    const { token, otp } = req.body;

    if (!token && !otp) {
      res.status(400).json({ 
        success: false,
        message: 'Reset token or OTP is required' 
      });
      return;
    }

    let resetRecord;

    if (token) {
      // Verify token
      resetRecord = await prisma.passwordReset.findFirst({
        where: {
          token,
          used: false,
          expiresAt: { gt: new Date() }
        }
      });
    } else if (otp) {
      // Verify OTP
      resetRecord = await prisma.passwordReset.findFirst({
        where: {
          otp,
          used: false,
          expiresAt: { gt: new Date() }
        }
      });
    }

    if (!resetRecord) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid or expired reset token/OTP' 
      });
      return;
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { email: resetRecord.email }
    });

    if (!user) {
      res.status(400).json({ 
        success: false,
        message: 'User not found' 
      });
      return;
    }

    res.status(200).json({ 
      success: true,
      message: 'Token verified successfully',
      data: {
        email: resetRecord.email,
        token: resetRecord.token // Return token for password reset
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};


// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      res.status(400).json({ 
        success: false,
        message: 'Token, new password, and confirm password are required' 
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters long' 
      });
      return;
    }

    // Find valid reset record
    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!resetRecord) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid or expired reset token' 
      });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: resetRecord.email }
    });

    if (!user) {
      res.status(400).json({ 
        success: false,
        message: 'User not found' 
      });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update user password and mark reset as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          verified: true, // Mark as verified if not already
          updatedAt: new Date()
        }
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true }
      }),
      // Invalidate all refresh tokens for security
      prisma.refreshToken.deleteMany({
        where: { userId: user.id }
      })
    ]);

    res.status(200).json({ 
      success: true,
      message: 'Password reset successfully. Please login with your new password.' 
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

// Resend reset email
export const resendResetEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
      return;
    }

    // Check if there's a recent reset request (rate limiting)
    const recentReset = await prisma.passwordReset.findFirst({
      where: {
        email: email.toLowerCase(),
        createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } // 2 minutes
      }
    });

    if (recentReset) {
      res.status(429).json({ 
        success: false,
        message: 'Please wait 2 minutes before requesting another reset email.' 
      });
      return;
    }

    // Reuse the requestPasswordReset logic
    await requestPasswordReset(req, res);

  } catch (error) {
    console.error('Resend reset email error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};


