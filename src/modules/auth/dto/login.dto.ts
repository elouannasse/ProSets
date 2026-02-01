import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class Auth0CallbackDto {
  @ApiProperty({ description: 'Auth0 access token' })
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({ description: 'Auth0 ID token' })
  @IsOptional()
  @IsString()
  idToken?: string;
}
