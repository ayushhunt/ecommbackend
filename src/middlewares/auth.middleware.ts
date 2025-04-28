// // src/middlewares/auth.middleware.ts
// import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';
// import { JWT_CONFIG } from '../config/auth';
// import { prisma } from '../config/prisma';

// // Extend the type of Request to ensure type safety
// declare module 'express-serve-static-core' {
//   interface Request {
//     user: {
//       id: string;
//       // Add other properties from your User type that you'll use
//     }
//   }
// }

// export const authenticate = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// )  => {
//   const authHeader = req.headers.authorization;
//   console.log('authHeader', authHeader);
  
//   const token = authHeader?.split(' ')[1];
//   console.log('token', token);
//   if (!token) {
//     res.status(401).json({ message: 'Authentication required' });
//     return;
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_CONFIG.accessTokenSecret) as { userId: string };
//     console.log('decoded', decoded);
//     const user = await prisma.user.findUnique({
//       where: { id: decoded.userId }
//     });
//     console.log('user', user);
//     if (!user) {
//       res.status(401).json({ message: 'User not found' });
//       return;
//     }

//     // Attach user to request
//     req.user = { id: user.id };
//     next();
//   } catch (error) {
//     res.status(401).json({ message: 'Invalid token' });
//   }
// };



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

const handleTokenRefresh = async (userId: string): Promise<string | null> => {
  try {
    // Find valid refresh token for user
    const userRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        userId: userId,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!userRefreshToken) {
      console.log('No valid refresh token found');
      return null;
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId },
      JWT_CONFIG.accessTokenSecret,
      { expiresIn: '1m' }
    );
    console.log('newAccessToken', newAccessToken);
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
};

const getTokenFromRequest = (req: Request): string | null => {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [bearer, token] = authHeader.split(' ');
    if (bearer === 'Bearer' && token) {
      return token;
    }
  }

  // Check cookies if no Authorization header
  const cookies = parse(req.headers.cookie || '');
  return cookies.accessToken || null;
};


export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = getTokenFromRequest(req);
  
    console.log('token', token);
    if (!token) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    try {
      // First try to verify the existing token
      const decoded = jwt.verify(token, JWT_CONFIG.accessTokenSecret) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        res.status(401).json({ message: 'User not found' });
        return;
      }

      req.user = { id: user.id };
      next();

    } catch (error) {
      // If token verification fails, check if it's because of expiration
      if (error instanceof jwt.TokenExpiredError) {
        // Try to decode the expired token to get userId
        const decoded = jwt.decode(token) as { userId: string };
        console.log('decoded', decoded);
        if (!decoded?.userId) {
          res.status(401).json({ message: 'Invalid token format' });
          return;
        }

        // Try to refresh the token
        const newAccessToken = await handleTokenRefresh(decoded.userId);
        
        if (!newAccessToken) {
          res.status(401).json({ message: 'Session expired. Please login again.' });
          return;
        }

        // Set the new access token in response header
        res.setHeader('Authorization', `Bearer ${newAccessToken}`);
        
        // Also set it as a cookie for easier frontend access
        res.setHeader('Set-Cookie', serialize('accessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 60 // 1 minute
        }));

        // Set user in request and continue
        req.user = { id: decoded.userId };
        next();
      } else {
        // If it's some other error, return authentication failure
        res.status(401).json({ message: 'Invalid token' });
        return;
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};