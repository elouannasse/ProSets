import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { FilterAssetDto } from './dto/filter-asset.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all active assets with filters' })
  @ApiResponse({ status: 200, description: 'List of assets with pagination' })
  async findAll(@Query() filters: FilterAssetDto) {
    return this.assetsService.findAll(filters);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Get all categories with asset count' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  async getCategories() {
    return this.assetsService.getCategories();
  }

  @Get('my-assets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user assets (including soft-deleted)' })
  @ApiResponse({ status: 200, description: 'List of user assets' })
  async getMyAssets(
    @CurrentUser() user: any,
    @Query() filters: FilterAssetDto,
  ) {
    return this.assetsService.findMyAssets(user.auth0Id, filters);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiResponse({ status: 200, description: 'Asset details' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async findOne(@Param('id') id: string) {
    return this.assetsService.findOne(id);
  }

  @Post()
  @Roles('VENDEUR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new asset (VENDEUR or ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Asset created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Vendor role required' })
  async create(
    @CurrentUser() user: any,
    @Body() createAssetDto: CreateAssetDto,
  ) {
    return this.assetsService.create(user.auth0Id, createAssetDto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update asset (owner or ADMIN)' })
  @ApiResponse({ status: 200, description: 'Asset updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not asset owner' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateAssetDto: UpdateAssetDto,
  ) {
    return this.assetsService.update(id, user.auth0Id, updateAssetDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete asset (owner or ADMIN)' })
  @ApiResponse({ status: 200, description: 'Asset soft deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not asset owner' })
  @ApiQuery({
    name: 'hard',
    required: false,
    type: Boolean,
    description: 'Hard delete (ADMIN only)',
  })
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('hard') hard?: string,
  ) {
    const hardDelete = hard === 'true';
    return this.assetsService.remove(id, user.auth0Id, hardDelete);
  }

  @Post(':id/restore')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore soft-deleted asset' })
  @ApiResponse({ status: 200, description: 'Asset restored successfully' })
  @ApiResponse({ status: 404, description: 'Deleted asset not found' })
  async restore(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assetsService.restore(id, user.auth0Id);
  }

  @Post(':id/download')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Increment download counter' })
  @ApiResponse({ status: 200, description: 'Download counter incremented' })
  async incrementDownloads(@Param('id') id: string) {
    return this.assetsService.incrementDownloads(id);
  }
}
