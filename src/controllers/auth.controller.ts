// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { JWT_CONFIG, BCRYPT_ROUNDS } from '../config/auth';
import { parse, serialize } from 'cookie';
import { OAuth2Client } from 'google-auth-library';



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