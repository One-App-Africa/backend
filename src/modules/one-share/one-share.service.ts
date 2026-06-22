import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';

@Injectable()
export class OneShareService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  async createOneShare(userId: string, createData: any) {
    this.logger.log(`One Share creation for user ${userId}`, 'OneShareService');
    return { message: 'One Share created successfully' };
  }

  async getMyShares(userId: string) {
    return { shares: [] };
  }
}
