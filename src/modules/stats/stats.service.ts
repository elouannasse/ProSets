import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

interface VendorDashboard {
  totalRevenue: number;
  platformCommission: number;
  vendorEarnings: number;
  totalSales: number;
  totalAssets: number;
  activeAssets: number;
  totalDownloads: number;
  salesByMonth: Array<{ month: string; sales: number; revenue: number }>;
  topPerformingAssets: Array<{
    id: string;
    title: string;
    price: number;
    salesCount: number;
    revenue: number;
    downloads: number;
  }>;
}

interface AdminStats {
  users: {
    total: number;
    clients: number;
    vendors: number;
    admins: number;
    newThisMonth: number;
  };
  assets: {
    total: number;
    active: number;
    inactive: number;
    newThisMonth: number;
  };
  revenue: {
    total: number;
    thisMonth: number;
    platformCommission: number;
  };
  orders: {
    total: number;
    paid: number;
    pending: number;
    failed: number;
    conversionRate: string;
  };
  downloads: {
    total: number;
    thisMonth: number;
    averagePerDay: string;
  };
  revenueByMonth: Array<{ month: string; revenue: number; orders: number }>;
  topVendors: Array<{
    id: string;
    name: string;
    email: string;
    totalSales: number;
    totalRevenue: number;
  }>;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private readonly COMMISSION_RATE = 0.1; // 10%

  constructor(private prisma: PrismaService) {}

  /**
   * Get vendor dashboard statistics
   */
  async getVendorDashboard(vendorId: string): Promise<VendorDashboard> {
    // Get vendor's total sales and revenue
    const salesAggregate = await this.prisma.order.aggregate({
      where: {
        asset: { vendorId },
        status: 'PAID',
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const totalRevenue = Number(salesAggregate._sum.totalAmount) || 0;
    const platformCommission = totalRevenue * this.COMMISSION_RATE;
    const vendorEarnings = totalRevenue * (1 - this.COMMISSION_RATE);
    const totalSales = salesAggregate._count.id;

    // Get asset counts
    const [totalAssets, activeAssets] = await Promise.all([
      this.prisma.asset.count({ where: { vendorId } }),
      this.prisma.asset.count({ where: { vendorId, status: 'ACTIVE' } }),
    ]);

    // Get total downloads for vendor's assets
    const downloadAggregate = await this.prisma.asset.aggregate({
      where: { vendorId },
      _sum: { downloads: true },
    });
    const totalDownloads = downloadAggregate._sum.downloads || 0;

    // Get sales by month (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const salesByMonth = await this.prisma.$queryRaw<
      Array<{ month: string; sales: number; revenue: string }>
    >`
      SELECT 
        TO_CHAR(o."createdAt", 'YYYY-MM') as month,
        COUNT(o.id)::int as sales,
        COALESCE(SUM(o."totalAmount"), 0)::text as revenue
      FROM orders o
      INNER JOIN assets a ON o."assetId" = a.id
      WHERE a."vendorId" = ${vendorId}
        AND o.status = 'PAID'
        AND o."createdAt" >= ${twelveMonthsAgo}
      GROUP BY TO_CHAR(o."createdAt", 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `;

    const formattedSalesByMonth = salesByMonth.map((s) => ({
      month: s.month,
      sales: s.sales,
      revenue: parseFloat(s.revenue),
    }));

    // Get top performing assets
    const topAssets = await this.prisma.asset.findMany({
      where: { vendorId },
      select: {
        id: true,
        title: true,
        price: true,
        downloads: true,
        orders: {
          where: { status: 'PAID' },
          select: { totalAmount: true },
        },
      },
      orderBy: { downloads: 'desc' },
      take: 5,
    });

    const topPerformingAssets = topAssets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      price: Number(asset.price),
      salesCount: asset.orders.length,
      revenue: asset.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      downloads: asset.downloads,
    }));

    return {
      totalRevenue,
      platformCommission,
      vendorEarnings,
      totalSales,
      totalAssets,
      activeAssets,
      totalDownloads,
      salesByMonth: formattedSalesByMonth,
      topPerformingAssets,
    };
  }

  /**
   * Get vendor's assets with performance stats
   */
  async getVendorAssets(vendorId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where: { vendorId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          category: true,
          price: true,
          status: true,
          downloads: true,
          createdAt: true,
          orders: {
            where: { status: 'PAID' },
            select: { totalAmount: true },
          },
        },
      }),
      this.prisma.asset.count({ where: { vendorId } }),
    ]);

    const assetsWithStats = assets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      category: asset.category,
      price: Number(asset.price),
      status: asset.status,
      downloads: asset.downloads,
      salesCount: asset.orders.length,
      totalRevenue: asset.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      createdAt: asset.createdAt,
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
   * Get admin statistics (global KPIs)
   */
  async getAdminStats(): Promise<AdminStats> {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Users stats
    const [totalUsers, clientsCount, vendorsCount, adminsCount, newUsersThisMonth] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: 'CLIENT' } }),
        this.prisma.user.count({ where: { role: 'VENDEUR' } }),
        this.prisma.user.count({ where: { role: 'ADMIN' } }),
        this.prisma.user.count({ where: { createdAt: { gte: firstDayOfMonth } } }),
      ]);

    // Assets stats
    const [totalAssets, activeAssets, inactiveAssets, newAssetsThisMonth] =
      await Promise.all([
        this.prisma.asset.count(),
        this.prisma.asset.count({ where: { status: 'ACTIVE' } }),
        this.prisma.asset.count({ where: { status: 'INACTIVE' } }),
        this.prisma.asset.count({ where: { createdAt: { gte: firstDayOfMonth } } }),
      ]);

    // Revenue stats
    const [totalRevenueAgg, monthRevenueAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: 'PAID' },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: 'PAID',
          createdAt: { gte: firstDayOfMonth },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalRevenue = Number(totalRevenueAgg._sum.totalAmount) || 0;
    const thisMonthRevenue = Number(monthRevenueAgg._sum.totalAmount) || 0;
    const platformCommission = totalRevenue * this.COMMISSION_RATE;

    // Orders stats
    const [totalOrders, paidOrders, pendingOrders, failedOrders] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'PAID' } }),
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count({ where: { status: 'FAILED' } }),
    ]);

    const conversionRate = totalOrders > 0
      ? ((paidOrders / totalOrders) * 100).toFixed(2)
      : '0.00';

    // Downloads stats
    const [totalDownloads, monthDownloads] = await Promise.all([
      this.prisma.download.count(),
      this.prisma.download.count({ where: { createdAt: { gte: firstDayOfMonth } } }),
    ]);

    const daysInMonth = now.getDate();
    const averagePerDay = daysInMonth > 0
      ? (monthDownloads / daysInMonth).toFixed(2)
      : '0.00';

    // Revenue by month (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const revenueByMonth = await this.prisma.$queryRaw<
      Array<{ month: string; revenue: string; orders: number }>
    >`
      SELECT 
        TO_CHAR("createdAt", 'YYYY-MM') as month,
        COALESCE(SUM("totalAmount"), 0)::text as revenue,
        COUNT(id)::int as orders
      FROM orders
      WHERE status = 'PAID'
        AND "createdAt" >= ${twelveMonthsAgo}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `;

    const formattedRevenue = revenueByMonth.map((r) => ({
      month: r.month,
      revenue: parseFloat(r.revenue),
      orders: r.orders,
    }));

    // Top vendors by revenue
    const topVendorsData = await this.prisma.user.findMany({
      where: { role: 'VENDEUR' },
      select: {
        id: true,
        name: true,
        email: true,
        vendorAssets: {
          select: {
            orders: {
              where: { status: 'PAID' },
              select: { totalAmount: true },
            },
          },
        },
      },
      take: 100, // Get all vendors
    });

    const topVendors = topVendorsData
      .map((vendor) => {
        const totalSales = vendor.vendorAssets.reduce(
          (sum, asset) => sum + asset.orders.length,
          0,
        );
        const totalRevenue = vendor.vendorAssets.reduce(
          (sum, asset) =>
            sum + asset.orders.reduce((s, o) => s + Number(o.totalAmount), 0),
          0,
        );

        return {
          id: vendor.id,
          name: vendor.name || 'Unknown',
          email: vendor.email,
          totalSales,
          totalRevenue,
        };
      })
      .filter((v) => v.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    return {
      users: {
        total: totalUsers,
        clients: clientsCount,
        vendors: vendorsCount,
        admins: adminsCount,
        newThisMonth: newUsersThisMonth,
      },
      assets: {
        total: totalAssets,
        active: activeAssets,
        inactive: inactiveAssets,
        newThisMonth: newAssetsThisMonth,
      },
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        platformCommission,
      },
      orders: {
        total: totalOrders,
        paid: paidOrders,
        pending: pendingOrders,
        failed: failedOrders,
        conversionRate,
      },
      downloads: {
        total: totalDownloads,
        thisMonth: monthDownloads,
        averagePerDay,
      },
      revenueByMonth: formattedRevenue,
      topVendors,
    };
  }
}
