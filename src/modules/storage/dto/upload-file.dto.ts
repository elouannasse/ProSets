import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum FileType {
  // 3D Models
  BLEND = 'blend',
  FBX = 'fbx',
  OBJ = 'obj',
  GLTF = 'gltf',
  GLB = 'glb',
  // Archives
  ZIP = 'zip',
  RAR = 'rar',
  // Images
  PNG = 'png',
  JPG = 'jpg',
  JPEG = 'jpeg',
  WEBP = 'webp',
  // Videos
  MP4 = 'mp4',
  WEBM = 'webm',
}

export enum BucketType {
  SOURCE = 'source', // Private bucket for source files
  PREVIEW = 'preview', // Public bucket for previews
}

export class UploadFileDto {
  @ApiProperty({ description: 'File to upload', type: 'string', format: 'binary' })
  file: Express.Multer.File;

  @ApiProperty({ enum: FileType, description: 'File type' })
  @IsEnum(FileType)
  fileType: FileType;

  @ApiProperty({ enum: BucketType, description: 'Bucket type (source or preview)' })
  @IsEnum(BucketType)
  bucketType: BucketType;

  @ApiProperty({ required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;
}

export const FILE_SIZE_LIMITS = {
  source: 500 * 1024 * 1024, // 500 MB for source files
  preview: 10 * 1024 * 1024, // 10 MB for previews
};

export const ALLOWED_MIME_TYPES = {
  // 3D Models
  blend: 'application/x-blender',
  fbx: 'application/octet-stream',
  obj: 'text/plain',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  // Archives
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  // Videos
  mp4: 'video/mp4',
  webm: 'video/webm',
};
