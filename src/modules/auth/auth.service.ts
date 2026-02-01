import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface Auth0Profile {
  auth0Id: string;
  email: string;
  name?: string;
  roles?: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Find or create user from Auth0 profile
   * Called automatically by JWT strategy on each request
   */
  async findOrCreateUser(auth0Profile: Auth0Profile) {
    const { auth0Id, email, name, roles } = auth0Profile;

    if (!auth0Id || !email) {
      throw new BadRequestException('Invalid Auth0 profile: missing auth0Id or email');
    }

    try {
      // Try to find existing user
      let user = await this.prisma.user.findUnique({
        where: { auth0Id },
      });

      if (user) {
        // Update user information if changed
        if (user.email !== email || user.name !== name) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: {
              email,
              name: name || user.name,
            },
          });
          this.logger.log(`User updated: ${user.id}`);
        }
      } else {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            auth0Id,
            email,
            name,
            role: 'CLIENT', // Default role
          },
        });
        this.logger.log(`New user created: ${user.id} (${email})`);
      }

      return user;
    } catch (error) {
      this.logger.error(`Error finding or creating user: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user profile by Auth0 ID
   */
  async getUserProfile(auth0Id: string) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get user by internal ID
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user role (Admin only)
   */
  async updateUserRole(
    adminAuth0Id: string,
    targetUserId: string,
    newRole: 'CLIENT' | 'VENDEUR' | 'ADMIN',
  ) {
    // Check if requester is admin
    const admin = await this.prisma.user.findUnique({
      where: { auth0Id: adminAuth0Id },
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can change user roles');
    }

    // Check if target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // Update role
    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    });

    this.logger.log(
      `User role updated: ${targetUserId} from ${targetUser.role} to ${newRole} by admin ${admin.id}`,
    );

    return updatedUser;
  }

  /**
   * Log authentication attempt
   */
  async logAuthAttempt(auth0Id: string, success: boolean, ipAddress?: string) {
    this.logger.log(
      `Auth attempt for ${auth0Id}: ${success ? 'SUCCESS' : 'FAILED'} from IP ${ipAddress || 'unknown'}`,
    );
    // You can extend this to store auth logs in database if needed
  }

  /**
   * Handle logout (can be extended to invalidate sessions)
   */
  async logout(userId: string) {
    this.logger.log(`User logged out: ${userId}`);
    // In a stateless JWT setup, logout is handled client-side
    // You can extend this to maintain a blacklist of tokens if needed
    return { message: 'Logged out successfully' };
  }
}
