import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseEnumPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FileType, BucketType } from './dto/upload-file.dto';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload-source')
  @Roles('VENDEUR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload source file to private bucket (VENDEUR only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Source file (3D model, archive) - Max 500MB',
        },
        fileType: {
          type: 'string',
          enum: Object.values(FileType),
          description: 'File type (blend, fbx, obj, zip, etc.)',
        },
      },
      required: ['file', 'fileType'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSource(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('fileType', new ParseEnumPipe(FileType)) fileType: FileType,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.storageService.uploadFile(
      file,
      fileType,
      BucketType.SOURCE,
      user.auth0Id,
    );
  }

  @Post('upload-preview')
  @Roles('VENDEUR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload preview file to public bucket (VENDEUR only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Preview file (image, video) - Max 10MB',
        },
        fileType: {
          type: 'string',
          enum: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'],
          description: 'Preview file type',
        },
      },
      required: ['file', 'fileType'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadPreview(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('fileType', new ParseEnumPipe(FileType)) fileType: FileType,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate preview file types
    const previewTypes = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'];
    if (!previewTypes.includes(fileType)) {
      throw new BadRequestException(
        'Invalid preview file type. Allowed: png, jpg, jpeg, webp, mp4, webm',
      );
    }

    return this.storageService.uploadFile(
      file,
      fileType,
      BucketType.PREVIEW,
      user.auth0Id,
    );
  }

  @Get('download/:key')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned URL for private file access' })
  @ApiParam({ name: 'key', description: 'S3 file key' })
  async getDownloadUrl(@Param('key') key: string) {
    return this.storageService.getPresignedUrl(key);
  }

  @Delete(':key')
  @Roles('VENDEUR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete file from S3 (owner or ADMIN)' })
  @ApiParam({ name: 'key', description: 'S3 file key' })
  async deleteFile(@Param('key') key: string, @Body('isPublic') isPublic?: boolean) {
    await this.storageService.deleteFile(key, isPublic);
    return { message: 'File deleted successfully', key };
  }
}

}
