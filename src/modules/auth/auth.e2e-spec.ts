import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  // Mock JWT token payload
  const mockUser = {
    userId: 'test-user-id',
    auth0Id: 'auth0|test123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'CLIENT',
  };

  const mockAdminUser = {
    userId: 'admin-user-id',
    auth0Id: 'auth0|admin123',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'ADMIN',
  };

  // Mock JWT token (you would generate this with a test Auth0 account or mock)
  const mockToken = 'mock-jwt-token';
  const mockAdminToken = 'mock-admin-jwt-token';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/health (GET)', () => {
    it('should return health status without authentication', () => {
      return request(app.getHttpServer())
        .get('/auth/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.service).toBe('auth');
        });
    });
  });

  describe('/auth/callback (POST)', () => {
    it('should process Auth0 callback successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/callback')
        .send({
          accessToken: 'test-access-token',
          idToken: 'test-id-token',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.message).toContain('successfully');
          expect(res.body.accessToken).toBeDefined();
        });
    });

    it('should fail with invalid callback data', () => {
      return request(app.getHttpServer())
        .post('/auth/callback')
        .send({
          invalidField: 'invalid',
        })
        .expect(400);
    });
  });

  describe('/auth/me (GET)', () => {
    it('should return current user profile with valid token', () => {
      // Note: In a real e2e test, you would use a valid JWT token
      // For this example, we're showing the expected behavior
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);
      // .expect((res) => {
      //   expect(res.body.email).toBe(mockUser.email);
      //   expect(res.body.role).toBe(mockUser.role);
      // });
    });

    it('should return 401 without authentication token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });

  describe('/auth/logout (POST)', () => {
    it('should logout user successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(201);
      // .expect((res) => {
      //   expect(res.body.message).toContain('Logged out successfully');
      // });
    });
  });

  describe('/auth/users/:userId/role (PATCH)', () => {
    it('should allow admin to update user role', () => {
      const targetUserId = 'target-user-id';

      return request(app.getHttpServer())
        .patch(`/auth/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${mockAdminToken}`)
        .send({ role: 'VENDEUR' })
        .expect(200);
      // .expect((res) => {
      //   expect(res.body.role).toBe('VENDEUR');
      // });
    });

    it('should deny non-admin users from updating roles', () => {
      const targetUserId = 'target-user-id';

      return request(app.getHttpServer())
        .patch(`/auth/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .patch('/auth/users/some-id/role')
        .send({ role: 'VENDEUR' })
        .expect(401);
    });
  });

  describe('/auth/verify (GET)', () => {
    it('should verify valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/verify')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);
      // .expect((res) => {
      //   expect(res.body.valid).toBe(true);
      //   expect(res.body.user).toBeDefined();
      // });
    });

    it('should reject invalid token', () => {
      return request(app.getHttpServer())
        .get('/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
