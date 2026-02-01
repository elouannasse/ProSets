import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { FilterAssetDto } from './dto/filter-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: FilterAssetDto) {
    const {
      category,
      minPrice,
      maxPrice,
      search,
      vendorId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'DESC',
    } = filters;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      status: 'ACTIVE',
      deletedAt: null, // Exclude soft-deleted assets
    };

    if (category) {
      where.category = category;
    }

    if (vendorId) {
      where.vendorId = vendorId;
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }

    // Search in title and description
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause
    const orderBy: any = {};
    orderBy[sortBy] = order.toLowerCase();

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      data: assets,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        deletedAt: null, // Exclude soft-deleted
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return asset;
  }

  async findMyAssets(auth0Id: string, filters: FilterAssetDto) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Include soft-deleted assets for vendor's own assets
    const { page = 1, limit = 20, sortBy = 'createdAt', order = 'DESC' } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      vendorId: user.id,
    };

    // Allow filtering by status for own assets
    if (filters.category) {
      where.category = filters.category;
    }

    const orderBy: any = {};
    orderBy[sortBy] = order.toLowerCase();

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: { orders: true },
          },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      data: assets,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(auth0Id: string, createAssetDto: CreateAssetDto) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has VENDEUR or ADMIN role
    if (user.role !== 'VENDEUR' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only vendors can create assets');
    }

    // Validate price
    if (createAssetDto.price < 0) {
      throw new BadRequestException('Price must be greater than or equal to 0');
    }

    return this.prisma.asset.create({
      data: {
        ...createAssetDto,
        vendorId: user.id,
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async update(id: string, auth0Id: string, updateAssetDto: UpdateAssetDto) {
    const asset = await this.findOne(id);
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check ownership or admin
    if (asset.vendorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only update your own assets');
    }

    // Validate price if provided
    if (updateAssetDto.price !== undefined && updateAssetDto.price < 0) {
      throw new BadRequestException('Price must be greater than or equal to 0');
    }

    return this.prisma.asset.update({
      where: { id },
      data: updateAssetDto,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: string, auth0Id: string, hardDelete = false) {
    const asset = await this.findOne(id);
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check ownership or admin
    if (asset.vendorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own assets');
    }

    if (hardDelete && user.role === 'ADMIN') {
      // Hard delete (admin only)
      await this.prisma.asset.delete({
        where: { id },
      });
      return { message: 'Asset permanently deleted' };
    } else {
      // Soft delete
      await this.prisma.asset.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'INACTIVE',
        },
      });
      return { message: 'Asset soft deleted successfully' };
    }
  }

  async restore(id: string, auth0Id: string) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find soft-deleted asset
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        deletedAt: { not: null },
      },
    });

    if (!asset) {
      throw new NotFoundException('Deleted asset not found');
    }

    // Check ownership or admin
    if (asset.vendorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only restore your own assets');
    }

    return this.prisma.asset.update({
      where: { id },
      data: {
        deletedAt: null,
        status: 'ACTIVE',
      },
    });
  }

  async incrementDownloads(id: string) {
    return this.prisma.asset.update({
      where: { id },
      data: {
        downloads: {
          increment: 1,
        },
      },
    });
  }

  async getCategories() {
    const categories = await this.prisma.asset.groupBy({
      by: ['category'],
      where: {
        status: 'ACTIVE',
        deletedAt: null,
      },
      _count: {
        category: true,
      },
      orderBy: {
        _count: {
          category: 'desc',
        },
      },
    });

    return categories.map((cat) => ({
      name: cat.category,
      count: cat._count.category,
    }));
  }
}
