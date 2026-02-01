import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import {
  FileType,
  BucketType,
  FILE_SIZE_LIMITS,
  ALLOWED_MIME_TYPES,
} from './dto/upload-file.dto';

interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private readonly sourceBucket: string;
  private readonly previewBucket: string;
  private readonly MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB
  private readonly PART_SIZE = 10 * 1024 * 1024; // 10 MB per part

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('aws.region'),
      credentials: {
        accessKeyId: this.configService.get('aws.accessKeyId'),
        secretAccessKey: this.configService.get('aws.secretAccessKey'),
      },
    });
    this.sourceBucket = this.configService.get('aws.s3.bucketPrivate');
    this.previewBucket = this.configService.get('aws.s3.bucketPublic');
  }

  /**
   * Validate file type based on extension and MIME type
   */
  validateFileType(file: Express.Multer.File, fileType: FileType): void {
    const expectedMimeType = ALLOWED_MIME_TYPES[fileType];

    // Special handling for generic MIME types
    const isValidMime =
      file.mimetype === expectedMimeType ||
      (fileType === 'fbx' && file.mimetype === 'application/octet-stream') ||
      (fileType === 'obj' &&
        (file.mimetype === 'text/plain' ||
          file.mimetype === 'application/octet-stream'));

    if (!isValidMime) {
      throw new BadRequestException(
        `Invalid file type. Expected ${fileType} (${expectedMimeType}), got ${file.mimetype}`,
      );
    }
  }

  /**
   * Validate file size based on bucket type
   */
  validateFileSize(file: Express.Multer.File, bucketType: BucketType): void {
    const maxSize = FILE_SIZE_LIMITS[bucketType];
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      throw new BadRequestException(
        `File size exceeds ${maxSizeMB}MB limit for ${bucketType} bucket`,
      );
    }
  }

  /**
   * Generate unique file key with proper structure
   */
  generateFileKey(
    userId: string,
    fileType: FileType,
    originalName?: string,
  ): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = fileType.toLowerCase();
    const safeName = originalName
      ? originalName.replace(/[^a-zA-Z0-9.-]/g, '_')
      : 'file';
    return `${userId}/${timestamp}-${uuid}-${safeName}.${extension}`;
  }

  /**
   * Upload file to S3 (with multipart for large files)
   */
  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    bucketType: BucketType,
    userId: string,
  ): Promise<UploadResult> {
    try {
      // Validation
      this.validateFileType(file, fileType);
      this.validateFileSize(file, bucketType);

      const bucket =
        bucketType === BucketType.SOURCE ? this.sourceBucket : this.previewBucket;
      const key = this.generateFileKey(userId, fileType, file.originalname);

      // Use multipart upload for large files
      if (file.size > this.MULTIPART_THRESHOLD) {
        await this.multipartUpload(file, bucket, key);
      } else {
        await this.simpleUpload(file, bucket, key);
      }

      const url = await this.getSignedUrlInternal(key, bucket);

      this.logger.log(
        `File uploaded successfully: ${key} (${file.size} bytes) to ${bucket}`,
      );

      return {
        key,
        url,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      this.logger.error('Error uploading file:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Simple upload for files < 100MB
   */
  private async simpleUpload(
    file: Express.Multer.File,
    bucket: string,
    key: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
    });

    await this.s3Client.send(command);
  }

  /**
   * Multipart upload for large files (>100MB)
   */
  private async multipartUpload(
    file: Express.Multer.File,
    bucket: string,
    key: string,
  ): Promise<void> {
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
    });

    const { UploadId } = await this.s3Client.send(createCommand);

    try {
      const parts = [];
      const numParts = Math.ceil(file.size / this.PART_SIZE);

      for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        const start = (partNumber - 1) * this.PART_SIZE;
        const end = Math.min(start + this.PART_SIZE, file.size);
        const partBuffer = file.buffer.slice(start, end);

        const uploadPartCommand = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId,
          PartNumber: partNumber,
          Body: partBuffer,
        });

        const { ETag } = await this.s3Client.send(uploadPartCommand);
        parts.push({ PartNumber: partNumber, ETag });

        this.logger.log(`Uploaded part ${partNumber}/${numParts} for ${key}`);
      }

      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId,
        MultipartUpload: { Parts: parts },
      });

      await this.s3Client.send(completeCommand);
    } catch (error) {
      this.logger.error('Multipart upload failed, aborting:', error);
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId,
      });
      await this.s3Client.send(abortCommand);
      throw error;
    }
  }

  /**
   * Get signed URL for private file access
   */
  private async getSignedUrlInternal(
    key: string,
    bucket: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Public method to get presigned URL
   */
  async getPresignedUrl(key: string, expiresIn = 3600) {
    const bucket = this.sourceBucket;

    try {
      const url = await this.getSignedUrlInternal(key, bucket, expiresIn);
      return { url };
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string, isPublic = false): Promise<void> {
    try {
      const bucket = isPublic ? this.previewBucket : this.sourceBucket;

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key} from ${bucket}`);
    } catch (error) {
      this.logger.error('Error deleting file:', error);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  /**
   * Delete multiple files (e.g., when deleting an asset)
   */
  async deleteFiles(
    files: Array<{ key: string; isPublic: boolean }>,
  ): Promise<void> {
    await Promise.all(
      files.map((file) => this.deleteFile(file.key, file.isPublic)),
    );
  }
}

