import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAllByUser(auth0Id: string) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: {
          select: {
            id: true,
            title: true,
            previewUrls: true,
            price: true,
          },
        },
      },
    });
  }

  async findOne(id: string, auth0Id: string) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        asset: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only view your own orders');
    }

    return order;
  }

  async create(auth0Id: string, createOrderDto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: createOrderDto.assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.order.create({
      data: {
        userId: user.id,
        assetId: asset.id,
        totalAmount: asset.price,
        status: 'PENDING',
      },
      include: {
        asset: true,
      },
    });
  }

  async updateStatus(id: string, status: 'PENDING' | 'PAID' | 'FAILED') {
    return this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }
}
