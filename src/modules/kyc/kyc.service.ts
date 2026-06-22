import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';

@Injectable()
export class KycService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  async submitKyc(userId: string, kycData: any) {
    this.logger.log(`KYC submission for user ${userId}`, 'KycService');
    return { message: 'KYC submitted successfully' };
  }

  async getKycStatus(userId: string) {
    const user = await this.knex('users')
      .where({ id: userId })
      .select('kyc_status', 'kyc_rejection_reason')
      .first();

    return { kycStatus: user?.kyc_status || 'not_started' };
  }
}
