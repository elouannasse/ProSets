import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders for current user' })
  @ApiResponse({ status: 200, description: 'User orders retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserOrders(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findUserOrders(
      user.auth0Id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('vendor/sales')
  @Roles('VENDEUR', 'ADMIN')
  @ApiOperation({ summary: 'Get vendor sales and statistics (VENDEUR only)' })
  @ApiResponse({
    status: 200,
    description: 'Vendor sales retrieved successfully',
    schema: {
      example: {
        data: [],
        stats: {
          totalSales: 42,
          totalRevenue: 1250.0,
          platformCommission: 125.0,
          vendorEarnings: 1125.0,
        },
        meta: { total: 42, page: 1, limit: 20, totalPages: 3 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Vendor role required' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getVendorSales(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findVendorSales(
      user.auth0Id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get order statistics (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Order stats retrieved successfully' })
  async getOrderStats() {
    return this.ordersService.getOrderStats();
  }

  @Get('check-ownership/:assetId')
  @ApiOperation({ summary: 'Check if user owns an asset' })
  @ApiResponse({ status: 200, description: 'Ownership check result' })
  async checkOwnership(
    @CurrentUser() user: any,
    @Param('assetId') assetId: string,
  ) {
    const owns = await this.ordersService.checkOwnership(user.auth0Id, assetId);
    return { owns, assetId };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by ID' })
  @ApiResponse({ status: 200, description: 'Order details retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not your order' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.findOne(id, user.auth0Id);
  }
}
