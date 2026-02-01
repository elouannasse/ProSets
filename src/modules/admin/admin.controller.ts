import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { StatsService } from '../stats/stats.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AssetStatus, UserRole } from '@prisma/client';

@ApiTags('admin')
@Controller('admin')
@ApiBearerAuth()
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly statsService: StatsService,
  ) {}

  // ==================== ASSETS MANAGEMENT ====================

  @Get('assets')
  @ApiOperation({ summary: 'Get all assets from all vendors (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Assets list retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: AssetStatus })
  @ApiQuery({ name: 'vendorId', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  async getAllAssets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: AssetStatus,
    @Query('vendorId') vendorId?: string,
    @Query('category') category?: string,
  ) {
    return this.adminService.getAllAssets(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
      { status, vendorId, category },
    );
  }

  @Patch('assets/:id/status')
  @ApiOperation({ summary: 'Update asset status (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
          description: 'New asset status',
        },
      },
      required: ['status'],
    },
  })
  @ApiResponse({ status: 200, description: 'Asset status updated successfully' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async updateAssetStatus(
    @CurrentUser() user: any,
    @Param('id') assetId: string,
    @Body('status') status: AssetStatus,
  ) {
    return this.adminService.updateAssetStatus(assetId, status, user.auth0Id);
  }

  @Delete('assets/:id')
  @ApiOperation({ summary: 'Soft delete asset (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiResponse({ status: 200, description: 'Asset deleted successfully' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async deleteAsset(
    @CurrentUser() user: any,
    @Param('id') assetId: string,
  ) {
    return this.adminService.deleteAsset(assetId, user.auth0Id);
  }

  // ==================== USERS MANAGEMENT ====================

  @Get('users')
  @ApiOperation({ summary: 'Get all users (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Users list retrieved successfully',
    schema: {
      example: {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'user@example.com',
            name: 'John Doe',
            auth0Id: 'auth0|123456',
            role: 'CLIENT',
            createdAt: '2026-01-15T10:00:00.000Z',
            _count: { orders: 5, vendorAssets: 0 },
          },
        ],
        meta: { total: 342, page: 1, limit: 50, totalPages: 7 },
      },
    },
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: UserRole,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllUsers(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
      { role, search },
    );
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetails(@Param('id') userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['CLIENT', 'VENDEUR', 'ADMIN'],
          description: 'New user role',
        },
      },
      required: ['role'],
    },
  })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot demote yourself' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @CurrentUser() user: any,
    @Param('id') userId: string,
    @Body('role') role: UserRole,
  ) {
    return this.adminService.updateUserRole(userId, role, user.auth0Id);
  }

  @Patch('users/:id/ban')
  @ApiOperation({ summary: 'Ban/Unban user (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        banned: {
          type: 'boolean',
          description: 'true to ban, false to unban',
        },
      },
      required: ['banned'],
    },
  })
  @ApiResponse({ status: 200, description: 'User ban status updated' })
  @ApiResponse({ status: 400, description: 'Cannot ban yourself' })
  async toggleUserBan(
    @CurrentUser() user: any,
    @Param('id') userId: string,
    @Body('banned') banned: boolean,
  ) {
    return this.adminService.toggleUserBan(userId, banned, user.auth0Id);
  }

  // ==================== STATISTICS ====================

  @Get('stats')
  @ApiOperation({ summary: 'Get global platform statistics (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Platform statistics retrieved successfully',
    schema: {
      example: {
        users: {
          total: 1523,
          clients: 1289,
          vendors: 198,
          admins: 36,
          newThisMonth: 87,
        },
        assets: {
          total: 456,
          active: 398,
          inactive: 58,
          newThisMonth: 23,
        },
        revenue: {
          total: 125430.5,
          thisMonth: 12543.25,
          platformCommission: 12543.05,
        },
        orders: {
          total: 3456,
          paid: 3124,
          pending: 245,
          failed: 87,
          conversionRate: '90.39',
        },
        downloads: {
          total: 15234,
          thisMonth: 1245,
          averagePerDay: '41.5',
        },
        revenueByMonth: [],
        topVendors: [],
      },
    },
  })
  async getAdminStats() {
    return this.statsService.getAdminStats();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get admin activity logs (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Admin logs retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAdminLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAdminLogs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }
}
