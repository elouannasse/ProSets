import {
  IsString,
  IsNumber,
  IsArray,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAssetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  previewUrls: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sourceFileKey: string;
}
