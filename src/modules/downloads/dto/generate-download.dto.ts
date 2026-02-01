import { IsNotEmpty, IsString, IsUUID, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateDownloadDto {
  @ApiProperty({
    description: 'Asset ID to download',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'Asset ID is required' })
  @IsString()
  @IsUUID('4', { message: 'Asset ID must be a valid UUID' })
  assetId: string;

  @ApiProperty({
    description: 'URL expiration in seconds (default: 300, max: 3600)',
    example: 300,
    required: false,
    default: 300,
  })
  @IsOptional()
  @IsInt()
  @Min(60, { message: 'Expiration must be at least 60 seconds' })
  expirationSeconds?: number;
}
