import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('aws.region'),
      credentials: {
        accessKeyId: this.configService.get('aws.accessKeyId'),
        secretAccessKey: this.configService.get('aws.secretAccessKey'),
      },
    });
  }

  async uploadFile(file: Express.Multer.File, isPublic = false) {
    const bucket = isPublic
      ? this.configService.get('aws.s3.bucketPublic')
      : this.configService.get('aws.s3.bucketPrivate');

    const key = `${uuidv4()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`File uploaded: ${key} to bucket ${bucket}`);

      return {
        key,
        bucket,
        url: isPublic
          ? `https://${bucket}.s3.${this.configService.get('aws.region')}.amazonaws.com/${key}`
          : null,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw error;
    }
  }

  async getPresignedUrl(key: string, expiresIn = 3600) {
    const bucket = this.configService.get('aws.s3.bucketPrivate');

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return { url };
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(key: string, isPublic = false) {
    // Implementation for deleting files if needed
    this.logger.log(`Delete file: ${key}`);
  }
}
