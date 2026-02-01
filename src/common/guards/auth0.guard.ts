import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';
import { promisify } from 'util';

@Injectable()
export class Auth0Guard implements CanActivate {
  private checkJwt: any;

  constructor(private configService: ConfigService) {
    this.checkJwt = promisify(
      expressjwt({
        secret: expressJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri: `${this.configService.get('auth0.issuerUrl')}.well-known/jwks.json`,
        }) as GetVerificationKey,
        audience: this.configService.get('auth0.audience'),
        issuer: this.configService.get('auth0.issuerUrl'),
        algorithms: ['RS256'],
      }),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    try {
      await this.checkJwt(request, response);
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
