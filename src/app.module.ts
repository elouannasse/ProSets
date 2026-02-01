import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Configuration imports
import databaseConfig from './config/database.config';
import auth0Config from './config/auth0.config';
import stripeConfig from './config/stripe.config';
import awsConfig from './config/aws.config';

// Module imports
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AssetsModule } from './modules/assets/assets.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StorageModule } from './modules/storage/storage.module';
import { DownloadsModule } from './modules/downloads/downloads.module';

@Module({
  imports: [
    // Global Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, auth0Config, stripeConfig, awsConfig],
      envFilePath: '.env',
    }),

    // Health Check
    TerminusModule,

    // Database
    PrismaModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    AssetsModule,
    OrdersModule,
    PaymentsModule,
    StorageModule,
    DownloadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
