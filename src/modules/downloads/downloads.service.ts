import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AssetsService } from '../assets/assets.service';

interface DownloadHistory {
  assetId: string;
  assetTitle: string;
  assetCategory: string;
  price: number;
  purchaseDate: Date;
  downloadCount: number;
  lastDownloadAt: Date | null;
}

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);
  private readonly MAX_DOWNLOADS_PER_HOUR = 5;
  private readonly DEFAULT_EXPIRATION = 300; // 5 minutes
  private readonly MAX_EXPIRATION = 3600; // 1 hour

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private assetsService: AssetsService,
  ) {}

  /**
   * Generate presigned URL for asset download
   */
  async generateDownloadUrl(
    auth0Id: string,
    assetId: string,
    expirationSeconds?: number,
  ) {
    try {
      // 1. Get user
      const user = await this.prisma.user.findUnique({
        where: { auth0Id },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // 2. Check if asset exists
      const asset = await this.prisma.asset.findUnique({
        where: { id: assetId },
        include: { vendor: { select: { id: true, name: true } } },
      });

      if (!asset) {
        throw new NotFoundException('Asset not found');
      }

      if (asset.deletedAt) {
        throw new NotFoundException('This asset has been removed');
      }

      // 3. Check if user owns this asset (has a PAID order)
      const order = await this.prisma.order.findFirst({
        where: {
          userId: user.id,
          assetId: asset.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!order) {
        throw new ForbiddenException('You do not own this asset');
      }

      if (order.status === 'PENDING') {
        throw new ForbiddenException('Payment not confirmed yet. Please wait for payment confirmation.');
      }

      if (order.status === 'FAILED') {
        throw new ForbiddenException('Payment failed. Please purchase the asset again.');
      }

      if (order.status !== 'PAID') {
        throw new ForbiddenException('You do not have access to download this asset');
      }

      // 4. Check rate limiting (max 5 downloads per hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentDownloads = await this.prisma.download.count({
        where: {
          userId: user.id,
          assetId: asset.id,
          createdAt: { gte: oneHourAgo },
        },
      });

      if (recentDownloads >= this.MAX_DOWNLOADS_PER_HOUR) {
        throw new ConflictException(
          `Download limit exceeded. You can download this asset ${this.MAX_DOWNLOADS_PER_HOUR} times per hour. Please try again later.`,
        );
      }

      // 5. Validate expiration
      const expiration = expirationSeconds || this.DEFAULT_EXPIRATION;
      if (expiration > this.MAX_EXPIRATION) {
        throw new BadRequestException(
          `Expiration cannot exceed ${this.MAX_EXPIRATION} seconds (${this.MAX_EXPIRATION / 60} minutes)`,
        );
      }

      // 6. Generate presigned URL
      const { url } = await this.storageService.getPresignedUrl(
        asset.sourceFileKey,
        expiration,
      );

      const expiresAt = new Date(Date.now() + expiration * 1000);

      // 7. Log download attempt
      await this.prisma.download.create({
        data: {
          userId: user.id,
          assetId: asset.id,
        },
      });

      // 8. Increment download counter on asset
      await this.assetsService.incrementDownloads(asset.id);

      this.logger.log(
        `Download URL generated for user ${user.email} - Asset: ${asset.title} (${asset.id})`,
      );

      return {
        url,
        expiresAt,
        expiresIn: expiration,
        asset: {
          id: asset.id,
          title: asset.title,
          category: asset.category,
          vendor: asset.vendor.name,
        },
      };
    } catch (error) {
      this.logger.error('Error generating download URL:', error);
      throw error;
    }
  }

  /**
   * Get user download history
   */
  async getDownloadHistory(
    auth0Id: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: DownloadHistory[]; meta: any }> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const skip = (page - 1) * limit;

    // Get distinct assets that user has downloaded
    const downloads = await this.prisma.download.groupBy({
      by: ['assetId'],
      where: { userId: user.id },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip,
      take: limit,
    });

    const total = await this.prisma.download.groupBy({
      by: ['assetId'],
      where: { userId: user.id },
    });

    // Get asset details and order info
    const assetIds = downloads.map((d) => d.assetId);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: {
        id: true,
        title: true,
        category: true,
        price: true,
      },
    });

    const orders = await this.prisma.order.findMany({
      where: {
        userId: user.id,
        assetId: { in: assetIds },
        status: 'PAID',
      },
      select: {
        assetId: true,
        createdAt: true,
      },
    });

    // Map data together
    const history: DownloadHistory[] = downloads.map((download) => {
      const asset = assets.find((a) => a.id === download.assetId);
      const order = orders.find((o) => o.assetId === download.assetId);

      return {
        assetId: download.assetId,
        assetTitle: asset?.title || 'Unknown',
        assetCategory: asset?.category || 'Unknown',
        price: asset?.price || 0,
        purchaseDate: order?.createdAt || new Date(),
        downloadCount: download._count.id,
        lastDownloadAt: download._max.createdAt,
      };
    });

    return {
      data: history,
      meta: {
        total: total.length,
        page,
        limit,
        totalPages: Math.ceil(total.length / limit),
      },
    };
  }

  /**
   * Get all downloads (admin only)
   */
  async getAllDownloads(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [downloads, total] = await Promise.all([
      this.prisma.download.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          asset: {
            select: {
              id: true,
              title: true,
              category: true,
              price: true,
              vendor: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.download.count(),
    ]);

    return {
      data: downloads,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get download statistics (admin only)
   */
  async getDownloadStats() {
    // Total downloads
    const totalDownloads = await this.prisma.download.count();

    // Unique users who downloaded
    const uniqueUsers = await this.prisma.download.groupBy({
      by: ['userId'],
    });

    // Unique assets downloaded
    const uniqueAssets = await this.prisma.download.groupBy({
      by: ['assetId'],
    });

    // Most downloaded assets
    const mostDownloaded = await this.prisma.download.groupBy({
      by: ['assetId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const assetIds = mostDownloaded.map((d) => d.assetId);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: {
        id: true,
        title: true,
        category: true,
        price: true,
      },
    });

    const topAssets = mostDownloaded.map((download) => {
      const asset = assets.find((a) => a.id === download.assetId);
      return {
        assetId: download.assetId,
        title: asset?.title || 'Unknown',
        category: asset?.category || 'Unknown',
        price: asset?.price || 0,
        downloadCount: download._count.id,
      };
    });

    // Downloads per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentDownloads = await this.prisma.download.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    });

    return {
      totalDownloads,
      uniqueUsers: uniqueUsers.length,
      uniqueAssets: uniqueAssets.length,
      recentDownloads30Days: recentDownloads,
      averageDownloadsPerDay: (recentDownloads / 30).toFixed(2),
      topAssets,
    };
  }

  /**
   * Check if user can download asset
   */
  async canDownload(auth0Id: string, assetId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      return false;
    }

    const order = await this.prisma.order.findFirst({
      where: {
        userId: user.id,
        assetId,
        status: 'PAID',
      },
    });

    return !!order;
  }
}
