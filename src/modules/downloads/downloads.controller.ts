import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { DownloadsService } from './downloads.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GenerateDownloadDto } from './dto/generate-download.dto';

@ApiTags('downloads')
@Controller('downloads')
@ApiBearerAuth()
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Post('generate/:assetId')
  @ApiOperation({ summary: 'Generate presigned download URL for owned asset' })
  @ApiParam({ name: 'assetId', description: 'Asset ID to download' })
  @ApiResponse({
    status: 201,
    description: 'Download URL generated successfully',
    schema: {
      example: {
        url: 'https://bucket.s3.region.amazonaws.com/file?signature=...',
        expiresAt: '2026-02-01T15:30:00.000Z',
        expiresIn: 300,
        asset: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Medieval Castle 3D Model',
          category: 'Architecture',
          vendor: 'John Doe',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Asset not owned or payment pending' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  @ApiResponse({ status: 409, description: 'Download limit exceeded (max 5 per hour)' })
  async generateDownloadUrl(
    @CurrentUser() user: any,
    @Param('assetId') assetId: string,
    @Body() dto?: GenerateDownloadDto,
  ) {
    return this.downloadsService.generateDownloadUrl(
      user.auth0Id,
      assetId,
      dto?.expirationSeconds,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get download history for current user' })
  @ApiResponse({
    status: 200,
    description: 'Download history retrieved successfully',
    schema: {
      example: {
        data: [
          {
            assetId: '123e4567-e89b-12d3-a456-426614174000',
            assetTitle: 'Medieval Castle',
            assetCategory: 'Architecture',
            price: 29.99,
            purchaseDate: '2026-01-15T10:00:00.000Z',
            downloadCount: 3,
            lastDownloadAt: '2026-02-01T14:30:00.000Z',
          },
        ],
        meta: {
          total: 15,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      },
    },
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDownloadHistory(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.downloadsService.getDownloadHistory(
      user.auth0Id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('can-download/:assetId')
  @ApiOperation({ summary: 'Check if user can download an asset' })
  @ApiParam({ name: 'assetId', description: 'Asset ID to check' })
  @ApiResponse({
    status: 200,
    description: 'Download eligibility check result',
    schema: {
      example: {
        canDownload: true,
        assetId: '123e4567-e89b-12d3-a456-426614174000',
      },
    },
  })
  async checkDownloadEligibility(
    @CurrentUser() user: any,
    @Param('assetId') assetId: string,
  ) {
    const canDownload = await this.downloadsService.canDownload(
      user.auth0Id,
      assetId,
    );
    return { canDownload, assetId };
  }

  @Get('admin/all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all downloads (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'All downloads retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllDownloads(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.downloadsService.getAllDownloads(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('admin/stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get download statistics (ADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Download statistics retrieved successfully',
    schema: {
      example: {
        totalDownloads: 1523,
        uniqueUsers: 342,
        uniqueAssets: 156,
        recentDownloads30Days: 487,
        averageDownloadsPerDay: '16.23',
        topAssets: [
          {
            assetId: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Medieval Castle',
            category: 'Architecture',
            price: 29.99,
            downloadCount: 87,
          },
        ],
      },
    },
  })
  async getDownloadStats() {
    return this.downloadsService.getDownloadStats();
  }
}
