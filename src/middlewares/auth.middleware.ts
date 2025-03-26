// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth';
import { prisma } from '../config/prisma';

// Extend the type of Request to ensure type safety
declare module 'express-serve-static-core' {
  interface Request {
    user: {
      id: string;
      // Add other properties from your User type that you'll use
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
)  => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_CONFIG.accessTokenSecret) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    // Attach user to request
    req.user = { id: user.id };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};