import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    category?: string;
    page: number;
    limit: number;
  }) {
    const { category, page, limit } = params;
    const skip = (page - 1) * limit;

    const where = {
      status: 'ACTIVE' as const,
      ...(category && { category }),
    };

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
      },
    };
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return asset;
  }

  async create(auth0Id: string, createAssetDto: CreateAssetDto) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
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

    if (asset.vendorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only update your own assets');
    }

    return this.prisma.asset.update({
      where: { id },
      data: updateAssetDto,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(id: string, auth0Id: string) {
    const asset = await this.findOne(id);
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (asset.vendorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own assets');
    }

    await this.prisma.asset.delete({
      where: { id },
    });

    return { message: 'Asset deleted successfully' };
  }
}
