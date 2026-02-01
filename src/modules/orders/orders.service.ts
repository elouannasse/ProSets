import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all orders for a user
   */
  async findUserOrders(auth0Id: string, page = 1, limit = 20) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: user.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              description: true,
              price: true,
              category: true,
              previewUrls: true,
              sourceFileKey: true,
            },
          },
          payment: {
            select: {
              id: true,
              stripePaymentId: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where: { userId: user.id } }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single order with full details
   */
  async findOne(orderId: string, auth0Id: string) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        asset: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if user owns this order or is admin
    if (order.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  /**
   * Get vendor sales (VENDEUR only)
   */
  async findVendorSales(auth0Id: string, page = 1, limit = 20) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== 'VENDEUR' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only vendors can access sales data');
    }

    const skip = (page - 1) * limit;

    // Get orders for assets owned by this vendor
    const [orders, total, stats] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          asset: {
            vendorId: user.id,
          },
          status: 'PAID',
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              price: true,
              category: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          payment: {
            select: {
              id: true,
              stripePaymentId: true,
              amount: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.order.count({
        where: {
          asset: {
            vendorId: user.id,
          },
          status: 'PAID',
        },
      }),
      this.getVendorStats(user.id),
    ]);

    return {
      data: orders,
      stats,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Calculate vendor revenue statistics
   */
  private async getVendorStats(vendorId: string) {
    const result = await this.prisma.order.aggregate({
      where: {
        asset: {
          vendorId,
        },
        status: 'PAID',
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    });

    // Calculate commission (platform takes 10%)
    const totalRevenue = result._sum.totalAmount || 0;
    const platformCommission = totalRevenue * 0.1;
    const vendorEarnings = totalRevenue * 0.9;

    return {
      totalSales: result._count.id,
      totalRevenue,
      platformCommission,
      vendorEarnings,
    };
  }

  /**
   * Check if user already owns an asset
   */
  async checkOwnership(auth0Id: string, assetId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      return false;
    }

    const existingOrder = await this.prisma.order.findFirst({
      where: {
        userId: user.id,
        assetId,
        status: 'PAID',
      },
    });

    return !!existingOrder;
  }

  /**
   * Get order statistics (admin only)
   */
  async getOrderStats() {
    const [totalOrders, paidOrders, pendingOrders, failedOrders, revenue] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: 'PAID' } }),
        this.prisma.order.count({ where: { status: 'PENDING' } }),
        this.prisma.order.count({ where: { status: 'FAILED' } }),
        this.prisma.order.aggregate({
          where: { status: 'PAID' },
          _sum: { totalAmount: true },
        }),
      ]);

    return {
      totalOrders,
      paidOrders,
      pendingOrders,
      failedOrders,
      totalRevenue: revenue._sum.totalAmount || 0,
      conversionRate:
        totalOrders > 0 ? ((paidOrders / totalOrders) * 100).toFixed(2) : 0,
    };
  }
}

