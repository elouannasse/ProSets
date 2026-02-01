import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'ProSets Backend API - Version 1.0';
  }
}
