// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { JWT_CONFIG, BCRYPT_ROUNDS } from '../config/auth';
import passport from 'passport';
import { token } from 'morgan';



interface DecodedToken {
  userId: string;
  [key: string]: any;
}



export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Basic validation
    if (!email || !password) {
      res.status(400).json({ message: 'Email and password required' });
      return;
    }

    // Check existing user
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create unverified user
    const user = await prisma.user.create({
      data: {
        provider: 'email',
        email,
        name,
        passwordHash: hashedPassword,
        verified: false,
        addresses: {
          create: [
            {
              street: '123 Main St',
              city: 'Example City',
              state: 'Example State',
              zip: '12345',
            },
            {
              street: '456 Another St',
              city: 'Another City',
              state: 'Another State',
              zip: '67890',
            },
          ],
        },
      }
    });

    // TODO: Send verification email

    res.status(201).json({ message: 'User created. Please verify your email.' ,user});
    return;
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Registration failed' });
    return;
  }
};

export const login = async (req: Request, res: Response)=> {
  try {
    const { email, password } = req.body;

    // Validate request
    if (!email || !password) {
      res.status(422).json({ message: "Please fill in all fields (email and password)" });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(401).json({ message: "Email or password is invalid" });
      return;
    }

    // Handle third-party authentication users
    if (!user.passwordHash) {
      res.status(400).json({ message: "This account uses third-party authentication. Please log in using Google, GitHub, etc." });
      return;
    }

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ message: "Email or password is invalid" });
      return;
    }

    // Generate access and refresh tokens
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken=jwt.sign({
        userId: user.id
      }, JWT_CONFIG.accessTokenSecret, { expiresIn: '15m' });

      refreshToken = jwt.sign({userId: user.id}, JWT_CONFIG.refreshTokenSecret, { expiresIn: '7d'});
    } catch (jwtError) {
      console.error("JWT signing error:", jwtError);
      res.status(500).json({ message: "Error generating authentication tokens" });
      return;
    }

    // Store refresh token in the database
    try {
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
        },
      });
    } catch (dbError) {
      console.error("Database error:", dbError);
      res.status(500).json({ message: "Error storing authentication token" });
      return;
    }

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const refreshToken = async (req: Request, res: Response)=> {
  try {
    // Extract refresh token from request body
    const { refreshToken } = req.body;

    // Validate if refresh token exists
    if (!refreshToken) {
      res.status(401).json({ message: 'Refresh token not found' });
      return;
    }


    // Verify the refresh token
    const decodedRefreshToken = jwt.verify(
      refreshToken, 
      JWT_CONFIG.refreshTokenSecret
    ) as DecodedToken;

    // Find the refresh token in the database
    const userRefreshToken = await prisma.refreshToken.findUnique({
      where: {
        token: refreshToken,
        userId: decodedRefreshToken.userId,
        expiresAt: {
          gt: new Date() // Check if token hasn't expired
        }
      }
    });

    // Validate if refresh token exists in database
    if (!userRefreshToken) {
      res.status(401).json({ message: 'Refresh token invalid or expired' });
      return;
    }

    // Delete the existing refresh token
    await prisma.refreshToken.delete({
      where: {
        id: userRefreshToken.id
      }
    });

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: decodedRefreshToken.userId },
      JWT_CONFIG.accessTokenSecret,
      { 
        expiresIn: '15m'
      }
    );

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { userId: decodedRefreshToken.userId },
      JWT_CONFIG.refreshTokenSecret,
      { 
        expiresIn: '7d'
      }
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Store the new refresh token in the database
    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: decodedRefreshToken.userId,
        expiresAt
      }
    });

    // Return new tokens
    res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken
    });
    return;

  } catch (error: any) {
    // Handle JWT specific errors
    if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: 'Refresh token invalid or expired' });
      return;
    }

    // Handle general errors
    res.status(500).json({ message: error.message });
    return;
  }
};


// export const googleCallback = (req: Request, res: Response) => {
//   // Successful authentication, create JWT
//   const token = jwt.sign(
//     { userId: (req.user as any).id }, 
//     JWT_CONFIG.secret, 
//     { expiresIn: JWT_CONFIG.expiresIn }
//   );
  
//   // Redirect or send token
//   res.redirect(`/auth/success?token=${token}`);
// };