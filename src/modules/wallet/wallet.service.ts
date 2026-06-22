import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';

@Injectable()
export class WalletService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  async getBalance(userId: string) {
    const wallets = await this.knex('wallets')
      .where({ user_id: userId })
      .select('wallet_type', 'balance', 'currency');

    return { wallets };
  }
}
