import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({
    description: 'Asset ID to purchase',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'Asset ID is required' })
  @IsString()
  @IsUUID('4', { message: 'Asset ID must be a valid UUID' })
  assetId: string;
}
