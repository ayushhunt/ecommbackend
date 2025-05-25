import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth';
import { prisma } from '../config/prisma';
import { parse, serialize } from 'cookie';

declare module 'express-serve-static-core' {
  interface Request {
    user: {
      id: string;
    }
  }
}

const getTokensFromRequest = (req: Request): { accessToken: string | null, refreshToken: string | null } => {
  const cookies = parse(req.headers.cookie || '');
  return {
    accessToken: cookies.accessToken || null,
    refreshToken: cookies.refreshToken || null,
  };
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accessToken, refreshToken } = getTokensFromRequest(req);
    console.log('Access Token:', accessToken);
    console.log('Refresh Token:', refreshToken);
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_CONFIG.accessTokenSecret) as { userId: string };
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) {
          res.status(401).json({ message: 'User not found' });
          return;
        }
        req.user = { id: user.id };
        return next();
      } catch (error) {
        if (!(error instanceof jwt.TokenExpiredError)) {
          console.error('Invalid token');
          res.status(401).json({ message: 'Invalid token' });
          return;
        }
      }
    }

    // If no accessToken or it is expired, use refreshToken
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_CONFIG.refreshTokenSecret) as { userId: string };
        
        const userRefreshToken = await prisma.refreshToken.findFirst({
          where: {
            userId: decoded.userId,
            token: refreshToken,
            expiresAt: {
              gt: new Date()
            }
          }
        });

        if (!userRefreshToken) {
          res.status(401).json({ message: 'Invalid or expired refresh token' });
          return;
        }

        // Issue new access token
        const newAccessToken = jwt.sign(
          { userId: decoded.userId },
          JWT_CONFIG.accessTokenSecret,
          { expiresIn: '15m' }
        );

        // Set new access token in cookie
        res.setHeader('Set-Cookie', serialize('accessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60,
        }));

        req.user = { id: decoded.userId };
        return next();

      } catch (error) {
        console.error('Refresh token verification failed:', error);
        res.status(401).json({ message: 'Invalid refresh token' });
        return;
      }
    }

    // If neither accessToken nor refreshToken is available
    res.status(401).json({ message: 'Authentication required' });

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // First authenticate the user
    authenticate(req, res, async (err?: any) => {
      // If authentication failed, the error would have been handled by the authenticate middleware
      if (err) return;
      
      // If we get here, user is authenticated and req.user contains the user id
      if (!req.user || !req.user.id) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }
      
      // Fetch user with role information
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, role: true }
      });
      
      if (!user) {
        res.status(401).json({ message: 'User not found' });
        return;
      }
      
      // Check if user has admin role
      if (user.role !== 'ADMIN') {
        res.status(403).json({ message: 'Insufficient permissions' });
        return;
      }
      
      // User is authenticated and has admin role
      next();
    });
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};