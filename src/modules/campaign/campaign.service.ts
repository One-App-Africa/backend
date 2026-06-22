import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';

@Injectable()
export class CampaignService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  async getActiveCampaigns(userId: string) {
    return { campaigns: [] };
  }
}
