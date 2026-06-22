import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';

@Injectable()
export class CardService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  async createCard(userId: string) {
    this.logger.log(`Card creation for user ${userId}`, 'CardService');
    return { message: 'Card created successfully' };
  }

  async getMyCards(userId: string) {
    return { cards: [] };
  }
}
