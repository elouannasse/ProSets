import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { Auth0CallbackDto } from './dto/login.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Auth health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  healthCheck() {
    return { status: 'ok', service: 'auth', timestamp: new Date().toISOString() };
  }

  @Public()
  @Post('callback')
  @ApiOperation({
    summary: 'Handle Auth0 callback and sync user',
    description: 'Processes Auth0 authentication callback and creates/updates user in database',
  })
  @ApiResponse({ status: 200, description: 'User successfully authenticated and synced' })
  @ApiResponse({ status: 400, description: 'Invalid callback data' })
  async handleCallback(
    @Body() callbackDto: Auth0CallbackDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    
    // In a real implementation, you would validate the access token here
    // For now, we'll return a success message
    // The actual user sync happens in the JWT strategy when protected routes are called
    
    this.authService.logAuthAttempt('callback', true, ipAddress);
    
    return {
      message: 'Authentication callback processed successfully',
      accessToken: callbackDto.accessToken,
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the profile of the currently authenticated user',
  })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: any) {
    return this.authService.getUserById(user.userId);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Logs out the current user (in JWT stateless auth, handled client-side)',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@CurrentUser() user: any, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    this.authService.logAuthAttempt(user.auth0Id, true, ipAddress);
    return this.authService.logout(user.userId);
  }

  @Patch('users/:userId/role')
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update user role (Admin only)',
    description: 'Allows administrators to change user roles',
  })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body('role') role: 'CLIENT' | 'VENDEUR' | 'ADMIN',
  ) {
    return this.authService.updateUserRole(admin.auth0Id, userId, role);
  }

  @Get('verify')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify authentication token',
    description: 'Verifies if the provided JWT token is valid',
  })
  @ApiResponse({ status: 200, description: 'Token is valid' })
  @ApiResponse({ status: 401, description: 'Token is invalid or expired' })
  async verifyToken(@CurrentUser() user: any) {
    return {
      valid: true,
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    };
  }
}
