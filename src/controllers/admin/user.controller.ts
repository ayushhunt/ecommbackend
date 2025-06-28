import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { z } from 'zod';

// Validation schemas
const userFilterSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('10'),
  search: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  verified: z.enum(['true', 'false']).optional(),
  provider: z.enum(['email', 'google', 'github']).optional(),
  sortBy: z.enum(['createdAt', 'name', 'email']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().optional(),
  phoneNumber: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  verified: z.boolean().optional(),
});

// Get user statistics for admin dashboard
export const getUserStatistics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build time filter
    const timeFilter: any = {};
    if (startDate) timeFilter.gte = new Date(startDate as string);
    if (endDate) timeFilter.lte = new Date(endDate as string);
    
    const matchCondition: any = {};
    if (startDate || endDate) matchCondition.createdAt = timeFilter;

    // Total users count
    const totalUsers = await prisma.user.count({
      where: matchCondition
    });

    // Users by role
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      where: matchCondition,
      _count: {
        id: true
      }
    });

    // Users by provider
    const usersByProvider = await prisma.user.groupBy({
      by: ['provider'],
      where: matchCondition,
      _count: {
        id: true
      }
    });

    // Users by verification status
    const usersByVerification = await prisma.user.groupBy({
      by: ['verified'],
      where: matchCondition,
      _count: {
        id: true
      }
    });

    // New users over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Use Prisma's camelCase field names in raw query
    const newUsersOverTime = await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*)::integer as count
      FROM "User"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // Alternative approach using Prisma's groupBy (more reliable)
    // Get users from last 30 days and group by date
    const usersLast30Days = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: thirtyDaysAgo
        }
      },
      select: {
        createdAt: true
      }
    });

    // Group users by date manually
    const usersByDate = usersLast30Days.reduce((acc: any, user) => {
      const date = user.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date]++;
      return acc;
    }, {});

    const newUsersOverTimeProcessed = Object.entries(usersByDate).map(([date, count]) => ({
      date,
      count: Number(count)
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Top cities by user count
    const topCitiesByUserCount = await prisma.address.groupBy({
      by: ['city', 'state'],
      _count: {
        userId: true
      },
      orderBy: {
        _count: {
          userId: 'desc'
        }
      },
      take: 10
    });

    // Users with most addresses
    const usersWithMostAddresses = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            addresses: true
          }
        }
      },
      orderBy: {
        addresses: {
          _count: 'desc'
        }
      },
      take: 10
    });

    // Average addresses per user
    const addressStats = await prisma.address.aggregate({
      _count: {
        id: true
      }
    });
    const avgAddressesPerUser = totalUsers > 0 ? addressStats._count.id / totalUsers : 0;

    // Recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentRegistrations = await prisma.user.count({
      where: {
        createdAt: {
          gte: sevenDaysAgo
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'User statistics retrieved successfully',
      data: {
        totalUsers,
        recentRegistrations,
        avgAddressesPerUser: Math.round(avgAddressesPerUser * 100) / 100,
        usersByRole: usersByRole.map(item => ({
          role: item.role,
          count: item._count.id
        })),
        usersByProvider: usersByProvider.map(item => ({
          provider: item.provider,
          count: item._count.id
        })),
        usersByVerification: usersByVerification.map(item => ({
          verified: item.verified,
          count: item._count.id
        })),
        newUsersOverTime: newUsersOverTimeProcessed, // Use the processed data instead of raw query
        topCitiesByUserCount: topCitiesByUserCount.map(item => ({
          city: item.city,
          state: item.state,
          userCount: item._count.userId
        })),
        usersWithMostAddresses: usersWithMostAddresses.map(user => ({
          ...user,
          addressCount: user._count.addresses
        }))
      }
    });
  } catch (error: any) {
    console.error('Error fetching user statistics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve user statistics'
    });
  }
};

// Get all users with filtering, pagination, and search
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const validation = userFilterSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: validation.error.issues
      });
      return;
    }

    const {
      page,
      limit,
      search,
      role,
      verified,
      provider,
      sortBy,
      sortOrder,
      startDate,
      endDate
    } = validation.data;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) where.role = role;
    if (verified) where.verified = verified === 'true';
    if (provider) where.provider = provider;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get users with pagination
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          phoneNumber: true,
          role: true,
          verified: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              addresses: true
            }
          }
        },
        orderBy: {
          [sortBy]: sortOrder
        },
        skip,
        take: limitNum
      }),
      prisma.user.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: users.map(user => ({
        ...user,
        addressCount: user._count.addresses
      })),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: totalCount,
        limit: limitNum,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve users'
    });
  }
};

// Get user by ID with detailed information
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: {
            addresses: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Remove sensitive data
    const { passwordHash, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: {
        ...userWithoutPassword,
        addressCount: user._count.addresses
      }
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve user'
    });
  }
};

// Update user (admin only)
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid input data',
        errors: validation.error.issues
      });
      return;
    }

    const updateData = validation.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        role: true,
        verified: true,
        provider: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user'
    });
  }
};

// Delete user (admin only)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Prevent deleting admin users (optional safety check)
    if (existingUser.role === 'admin') {
      res.status(403).json({
        success: false,
        message: 'Cannot delete admin users'
      });
      return;
    }

    // Delete user (addresses will be deleted due to cascade)
    await prisma.user.delete({
      where: { id: userId }
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete user'
    });
  }
};

// Get user addresses (admin)
export const getUserAddresses = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const addresses = await prisma.address.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      message: 'User addresses retrieved successfully',
      data: addresses
    });
  } catch (error: any) {
    console.error('Error fetching user addresses:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve user addresses'
    });
  }
};

// Toggle user verification status
export const toggleUserVerification = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, verified: true, email: true }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        verified: !user.verified,
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        verified: true
      }
    });

    res.status(200).json({
      success: true,
      message: `User ${updatedUser.verified ? 'verified' : 'unverified'} successfully`,
      data: updatedUser
    });
  } catch (error: any) {
    console.error('Error toggling user verification:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle user verification'
    });
  }
};

// Get geographic distribution of users
export const getGeographicDistribution = async (req: Request, res: Response) => {
  try {
    // Users by state
    const usersByState = await prisma.address.groupBy({
      by: ['state'],
      _count: {
        userId: true
      },
      orderBy: {
        _count: {
          userId: 'desc'
        }
      }
    });

    // Users by city (top 20)
    const usersByCity = await prisma.address.groupBy({
      by: ['city', 'state'],
      _count: {
        userId: true
      },
      orderBy: {
        _count: {
          userId: 'desc'
        }
      },
      take: 20
    });

    // Users without addresses
    const usersWithoutAddresses = await prisma.user.count({
      where: {
        addresses: {
          none: {}
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Geographic distribution retrieved successfully',
      data: {
        usersByState: usersByState.map(item => ({
          state: item.state,
          userCount: item._count.userId
        })),
        usersByCity: usersByCity.map(item => ({
          city: item.city,
          state: item.state,
          userCount: item._count.userId
        })),
        usersWithoutAddresses
      }
    });
  } catch (error: any) {
    console.error('Error fetching geographic distribution:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve geographic distribution'
    });
  }
};

// Search users (advanced search) - FIXED
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phoneNumber: { contains: q } },
          {
            addresses: {
              some: {
                OR: [
                  { city: { contains: q, mode: 'insensitive' } },
                  { state: { contains: q, mode: 'insensitive' } },
                  { addressLine1: { contains: q, mode: 'insensitive' } }, // ✅ Fixed: street → addressLine1
                  { addressLine2: { contains: q, mode: 'insensitive' } }, // ✅ Added: search in addressLine2
                  { landmark: { contains: q, mode: 'insensitive' } },      // ✅ Added: search in landmark
                  { neighborhood: { contains: q, mode: 'insensitive' } }   // ✅ Added: search in neighborhood
                ]
              }
            }
          }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        verified: true,
        createdAt: true,
        addresses: {
          select: {
            city: true,
            state: true,
            addressLine1: true, // ✅ Added for better context
            country: true       // ✅ Added for better context
          },
          take: 1,
          where: {
            isActive: true // ✅ Only show active addresses
          }
        }
      },
      take: 50
    });

    res.status(200).json({
      success: true,
      message: 'Search results retrieved successfully',
      data: users,
      count: users.length
    });
  } catch (error: any) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search users'
    });
  }
};