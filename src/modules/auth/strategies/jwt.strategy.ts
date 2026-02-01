import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${configService.get('auth0.issuerUrl')}.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: configService.get('auth0.audience'),
      issuer: configService.get('auth0.issuerUrl'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Extract user information from Auth0 token
    const auth0Profile = {
      auth0Id: payload.sub,
      email: payload.email || payload[`${this.configService.get('auth0.audience')}/email`],
      name: payload.name || payload[`${this.configService.get('auth0.audience')}/name`],
      roles: payload[`${this.configService.get('auth0.audience')}/roles`] || [],
    };

    // Find or create user in database
    const user = await this.authService.findOrCreateUser(auth0Profile);

    if (!user) {
      throw new UnauthorizedException('User not found or could not be created');
    }

    return {
      userId: user.id,
      auth0Id: user.auth0Id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
