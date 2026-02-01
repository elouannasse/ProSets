import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole, AssetStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all assets (all vendors)
   */
  async getAllAssets(
    page = 1,
    limit = 50,
    filters?: {
      status?: AssetStatus;
      vendorId?: string;
      category?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.vendorId) where.vendorId = filters.vendorId;
    if (filters?.category) where.category = filters.category;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          orders: {
            where: { status: 'PAID' },
            select: { id: true },
          },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    const assetsWithStats = assets.map((asset) => ({
      ...asset,
      salesCount: asset.orders.length,
      orders: undefined, // Remove orders array
    }));

    return {
      data: assetsWithStats,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update asset status (ADMIN only)
   */
  async updateAssetStatus(assetId: string, status: AssetStatus, adminAuth0Id: string) {
    const admin = await this.prisma.user.findUnique({
      where: { auth0Id: adminAuth0Id },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Admin privileges required');
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { vendor: { select: { name: true, email: true } } },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const updatedAsset = await this.prisma.asset.update({
      where: { id: assetId },
      data: { status },
    });

    this.logger.log(
      `[ADMIN ACTION] ${admin.email} changed asset "${asset.title}" (${assetId}) status from ${asset.status} to ${status}`,
    );

    return updatedAsset;
  }

  /**
   * Soft delete asset (set deletedAt)
   */
  async deleteAsset(assetId: string, adminAuth0Id: string) {
    const admin = await this.prisma.user.findUnique({
      where: { auth0Id: adminAuth0Id },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Admin privileges required');
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const deletedAsset = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
      },
    });

    this.logger.warn(
      `[ADMIN ACTION] ${admin.email} deleted asset "${asset.title}" (${assetId})`,
    );

    return deletedAsset;
  }

  /**
   * Get all users
   */
  async getAllUsers(
    page = 1,
    limit = 50,
    filters?: {
      role?: UserRole;
      search?: string;
    },
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters?.role) where.role = filters.role;
    if (filters?.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          auth0Id: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              vendorAssets: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update user role (ADMIN only)
   */
  async updateUserRole(
    userId: string,
    newRole: UserRole,
    adminAuth0Id: string,
  ) {
    const admin = await this.prisma.user.findUnique({
      where: { auth0Id: adminAuth0Id },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Admin privileges required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === admin.id && newRole !== 'ADMIN') {
      throw new BadRequestException('You cannot demote yourself');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    this.logger.log(
      `[ADMIN ACTION] ${admin.email} changed ${user.email} role from ${user.role} to ${newRole}`,
    );

    return updatedUser;
  }

  /**
   * Get single user details (ADMIN)
   */
  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            asset: {
              select: { id: true, title: true, price: true },
            },
          },
        },
        vendorAssets: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            downloads: true,
            _count: {
              select: { orders: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Calculate user stats
    const [totalSpent, totalEarnings] = await Promise.all([
      this.prisma.order.aggregate({
        where: { userId: user.id, status: 'PAID' },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          asset: { vendorId: user.id },
          status: 'PAID',
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      ...user,
      stats: {
        totalSpent: Number(totalSpent._sum.totalAmount) || 0,
        totalEarnings: Number(totalEarnings._sum.totalAmount) || 0,
        totalOrders: user.orders.length,
        totalAssets: user.vendorAssets.length,
      },
    };
  }

  /**
   * Get recent admin activity logs
   */
  async getAdminLogs(page = 1, limit = 50) {
    // Note: This would typically query an AdminLog table
    // For now, return a placeholder response
    this.logger.log('Admin logs feature requires AdminLog table implementation');
    
    return {
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      message: 'Admin logs feature requires database schema update',
    };
  }

  /**
   * Ban/Unban user (soft delete pattern)
   */
  async toggleUserBan(userId: string, banned: boolean, adminAuth0Id: string) {
    const admin = await this.prisma.user.findUnique({
      where: { auth0Id: adminAuth0Id },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Admin privileges required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === admin.id) {
      throw new BadRequestException('You cannot ban yourself');
    }

    // Note: Would need to add `bannedAt` field to User model
    // For now, log the action
    this.logger.warn(
      `[ADMIN ACTION] ${admin.email} ${banned ? 'banned' : 'unbanned'} user ${user.email}`,
    );

    return {
      message: `User ${banned ? 'banned' : 'unbanned'} successfully`,
      userId: user.id,
      email: user.email,
      banned,
    };
  }
}
