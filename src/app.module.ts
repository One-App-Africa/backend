import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@/config/database.module';
import { RedisModule } from '@/config/redis.module';
import { LoggerModule } from '@/services/logger.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UserModule } from '@/modules/user/user.module';
import { KycModule } from '@/modules/kyc/kyc.module';
import { WalletModule } from '@/modules/wallet/wallet.module';
import { OneShareModule } from '@/modules/one-share/one-share.module';
import { CardModule } from '@/modules/card/card.module';
import { PaymentModule } from '@/modules/payment/payment.module';
import { TransactionModule } from '@/modules/transaction/transaction.module';
import { CampaignModule } from '@/modules/campaign/campaign.module';
import { OneBotModule } from '@/modules/one-bot/one-bot.module';
import { AdminModule } from '@/modules/admin/admin.module';
import { WebhookModule } from '@/modules/webhook/webhook.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        ENCRYPTION_KEY: Joi.string().length(32).required(),
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // Scheduling
    ScheduleModule.forRoot(),

    // Core modules
    DatabaseModule,
    RedisModule,
    LoggerModule,

    // Feature modules
    AuthModule,
    UserModule,
    KycModule,
    WalletModule,
    OneShareModule,
    CardModule,
    PaymentModule,
    TransactionModule,
    CampaignModule,
    OneBotModule,
    AdminModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
