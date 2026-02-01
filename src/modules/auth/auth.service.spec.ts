import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreateUser', () => {
    const auth0Profile = {
      auth0Id: 'auth0|123456',
      email: 'test@example.com',
      name: 'Test User',
      roles: [],
    };

    it('should create a new user if not exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-id-123',
        auth0Id: auth0Profile.auth0Id,
        email: auth0Profile.email,
        name: auth0Profile.name,
        role: 'CLIENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findOrCreateUser(auth0Profile);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { auth0Id: auth0Profile.auth0Id },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          auth0Id: auth0Profile.auth0Id,
          email: auth0Profile.email,
          name: auth0Profile.name,
          role: 'CLIENT',
        },
      });
      expect(result).toBeDefined();
      expect(result.email).toBe(auth0Profile.email);
    });

    it('should return existing user if already exists', async () => {
      const existingUser = {
        id: 'user-id-123',
        auth0Id: auth0Profile.auth0Id,
        email: auth0Profile.email,
        name: auth0Profile.name,
        role: 'CLIENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);

      const result = await service.findOrCreateUser(auth0Profile);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { auth0Id: auth0Profile.auth0Id },
      });
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingUser);
    });

    it('should update user if email or name changed', async () => {
      const existingUser = {
        id: 'user-id-123',
        auth0Id: auth0Profile.auth0Id,
        email: 'old@example.com',
        name: 'Old Name',
        role: 'CLIENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser = { ...existingUser, email: auth0Profile.email, name: auth0Profile.name };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.findOrCreateUser(auth0Profile);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: {
          email: auth0Profile.email,
          name: auth0Profile.name,
        },
      });
      expect(result.email).toBe(auth0Profile.email);
    });

    it('should throw BadRequestException if auth0Id is missing', async () => {
      const invalidProfile = { auth0Id: '', email: 'test@example.com' };

      await expect(service.findOrCreateUser(invalidProfile as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile by auth0Id', async () => {
      const user = {
        id: 'user-id-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'CLIENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.getUserProfile('auth0|123456');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserProfile('auth0|nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUserRole', () => {
    const adminAuth0Id = 'auth0|admin';
    const targetUserId = 'user-id-123';

    it('should allow admin to update user role', async () => {
      const admin = {
        id: 'admin-id',
        auth0Id: adminAuth0Id,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const targetUser = {
        id: targetUserId,
        auth0Id: 'auth0|target',
        email: 'target@example.com',
        name: 'Target User',
        role: 'CLIENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser = { ...targetUser, role: 'VENDEUR' };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(admin)
        .mockResolvedValueOnce(targetUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserRole(adminAuth0Id, targetUserId, 'VENDEUR');

      expect(result.role).toBe('VENDEUR');
    });

    it('should throw ForbiddenException if requester is not admin', async () => {
      const nonAdmin = {
        id: 'user-id',
        auth0Id: 'auth0|user',
        role: 'CLIENT',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(nonAdmin);

      await expect(
        service.updateUserRole('auth0|user', targetUserId, 'VENDEUR'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if target user not found', async () => {
      const admin = {
        id: 'admin-id',
        auth0Id: adminAuth0Id,
        role: 'ADMIN',
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(admin)
        .mockResolvedValueOnce(null);

      await expect(
        service.updateUserRole(adminAuth0Id, 'nonexistent-id', 'VENDEUR'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('logout', () => {
    it('should return success message', async () => {
      const result = await service.logout('user-id-123');

      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
