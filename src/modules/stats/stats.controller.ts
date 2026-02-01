import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('vendor')
@Controller('vendor')
@ApiBearerAuth()
@Roles('VENDEUR', 'ADMIN')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get vendor dashboard with KPIs and charts (VENDEUR only)' })
  @ApiResponse({
    status: 200,
    description: 'Vendor dashboard retrieved successfully',
    schema: {
      example: {
        totalRevenue: 5432.5,
        platformCommission: 543.25,
        vendorEarnings: 4889.25,
        totalSales: 127,
        totalAssets: 23,
        activeAssets: 20,
        totalDownloads: 456,
        salesByMonth: [
          { month: '2026-01', sales: 42, revenue: 1250.0 },
          { month: '2025-12', sales: 38, revenue: 1120.5 },
        ],
        topPerformingAssets: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Medieval Castle',
            price: 29.99,
            salesCount: 87,
            revenue: 2609.13,
            downloads: 245,
          },
        ],
      },
    },
  })
  async getVendorDashboard(@CurrentUser() user: any) {
    const vendor = await this.getVendorUser(user.auth0Id);
    return this.statsService.getVendorDashboard(vendor.id);
  }

  @Get('assets')
  @ApiOperation({ summary: 'Get vendor assets with performance stats (VENDEUR only)' })
  @ApiResponse({
    status: 200,
    description: 'Vendor assets with stats retrieved successfully',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getVendorAssets(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const vendor = await this.getVendorUser(user.auth0Id);
    return this.statsService.getVendorAssets(
      vendor.id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  /**
   * Helper to get vendor user from auth0Id
   */
  private async getVendorUser(auth0Id: string) {
    const { PrismaService } = await import('../../common/prisma/prisma.service');
    const prisma = new PrismaService();
    const user = await prisma.user.findUnique({ where: { auth0Id } });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}
