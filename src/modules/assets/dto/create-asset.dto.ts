import {
  IsString,
  IsNumber,
  IsArray,
  IsNotEmpty,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAssetDto {
  @ApiProperty({ example: 'Modern UI Kit', minLength: 5 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Title must be at least 5 characters long' })
  title: string;

  @ApiProperty({ example: 'Complete UI kit with modern design components' })
  @IsString()
  @IsNotEmpty()
  @MinLength(20, { message: 'Description must be at least 20 characters long' })
  description: string;

  @ApiProperty({ example: 49.99, minimum: 0 })
  @IsNumber()
  @Min(0, { message: 'Price must be greater than or equal to 0' })
  price: number;

  @ApiProperty({ example: '3D', description: 'Category of the asset' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({
    type: [String],
    example: ['https://example.com/preview1.jpg', 'https://example.com/preview2.jpg'],
    description: 'Array of preview image URLs',
  })
  @IsArray()
  @IsString({ each: true })
  previewUrls: string[];

  @ApiProperty({
    example: 'assets/source/uuid-file.zip',
    description: 'S3 key of the source file',
  })
  @IsString()
  @IsNotEmpty()
  sourceFileKey: string;
}
