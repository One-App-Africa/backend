import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';
import { LedgerService, TransactionType, EntryType } from '@/services/ledger.service';

export interface WalletBalance {
  mainBalance: number;
  promoBalance: number;
  totalBalance: number;
}

@Injectable()
export class WalletService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
    private ledgerService: LedgerService,
  ) {}

  /**
   * Get user's wallet balances
   */
  async getBalance(userId: string): Promise<WalletBalance> {
    const wallets = await this.knex('wallets')
      .where({ user_id: userId })
      .select('wallet_type', 'balance', 'currency');

    const mainWallet = wallets.find(w => w.wallet_type === 'main');
    const promoWallet = wallets.find(w => w.wallet_type === 'promo');

    const mainBalance = mainWallet ? parseFloat(mainWallet.balance) : 0;
    const promoBalance = promoWallet ? parseFloat(promoWallet.balance) : 0;

    return {
      mainBalance,
      promoBalance,
      totalBalance: mainBalance + promoBalance,
    };
  }

  /**
   * Get specific wallet
   */
  async getWallet(userId: string, walletType: 'main' | 'promo') {
    const wallet = await this.knex('wallets')
      .where({ user_id: userId, wallet_type: walletType })
      .first();

    if (!wallet) {
      throw new NotFoundException(`${walletType} wallet not found`);
    }

    return wallet;
  }

  /**
   * Credit promo wallet (for campaigns, referrals, etc.)
   * Note: Promo balance cannot be withdrawn directly - must enter network via One Share
   */
  async creditPromoWallet(
    userId: string,
    amount: number,
    description: string,
    referenceId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const trx = await this.knex.transaction();

    try {
      const promoWallet = await this.getWallet(userId, 'promo');

      // Record single entry credit to promo wallet
      await this.ledgerService.recordSingleEntry(
        {
          userId,
          walletId: promoWallet.id,
          transactionType: TransactionType.PROMO_CREDIT,
          entryType: EntryType.CREDIT,
          amount,
          description,
          referenceId,
          metadata,
        },
        trx,
      );

      await trx.commit();

      this.logger.log(
        `Promo wallet credited: User ${userId}, Amount ${amount}`,
        'WalletService',
      );
    } catch (error) {
      await trx.rollback();
      this.logger.error(
        `Failed to credit promo wallet: ${error.message}`,
        error.stack,
        'WalletService',
      );
      throw error;
    }
  }

  /**
   * Transfer from promo wallet to main wallet
   * This happens when user creates a One Share from promo balance
   */
  async transferPromoToMain(
    userId: string,
    amount: number,
    description: string,
    referenceId: string,
  ): Promise<void> {
    const trx = await this.knex.transaction();

    try {
      const promoWallet = await this.getWallet(userId, 'promo');
      const mainWallet = await this.getWallet(userId, 'main');

      // Record double-entry: Debit promo, Credit main
      await this.ledgerService.recordTransaction(
        {
          userId,
          walletId: promoWallet.id,
          transactionType: TransactionType.TRANSFER,
          entryType: EntryType.DEBIT,
          amount,
          description: `${description} (from promo)`,
          referenceId,
        },
        {
          userId,
          walletId: mainWallet.id,
          transactionType: TransactionType.TRANSFER,
          entryType: EntryType.CREDIT,
          amount,
          description: `${description} (to main)`,
          referenceId,
        },
        trx,
      );

      await trx.commit();

      this.logger.log(
        `Promo to main transfer: User ${userId}, Amount ${amount}`,
        'WalletService',
      );
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Debit main wallet (for One Share creation, card funding, withdrawals)
   */
  async debitMainWallet(
    userId: string,
    amount: number,
    transactionType: TransactionType,
    description: string,
    referenceId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const trx = await this.knex.transaction();

    try {
      const mainWallet = await this.getWallet(userId, 'main');

      await this.ledgerService.recordSingleEntry(
        {
          userId,
          walletId: mainWallet.id,
          transactionType,
          entryType: EntryType.DEBIT,
          amount,
          description,
          referenceId,
          metadata,
        },
        trx,
      );

      await trx.commit();

      this.logger.log(
        `Main wallet debited: User ${userId}, Amount ${amount}, Type ${transactionType}`,
        'WalletService',
      );
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Credit main wallet (for deposits, One Share claims, refunds)
   */
  async creditMainWallet(
    userId: string,
    amount: number,
    transactionType: TransactionType,
    description: string,
    referenceId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const trx = await this.knex.transaction();

    try {
      const mainWallet = await this.getWallet(userId, 'main');

      await this.ledgerService.recordSingleEntry(
        {
          userId,
          walletId: mainWallet.id,
          transactionType,
          entryType: EntryType.CREDIT,
          amount,
          description,
          referenceId,
          metadata,
        },
        trx,
      );

      await trx.commit();

      this.logger.log(
        `Main wallet credited: User ${userId}, Amount ${amount}, Type ${transactionType}`,
        'WalletService',
      );
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Transfer between users (used for One Share claim)
   */
  async transferBetweenUsers(
    fromUserId: string,
    toUserId: string,
    amount: number,
    transactionType: TransactionType,
    description: string,
    referenceId: string,
  ): Promise<void> {
    const trx = await this.knex.transaction();

    try {
      const fromWallet = await this.getWallet(fromUserId, 'main');
      const toWallet = await this.getWallet(toUserId, 'main');

      // Record double-entry transaction
      await this.ledgerService.recordTransaction(
        {
          userId: fromUserId,
          walletId: fromWallet.id,
          transactionType,
          entryType: EntryType.DEBIT,
          amount,
          description: `${description} (to user ${toUserId})`,
          referenceId,
        },
        {
          userId: toUserId,
          walletId: toWallet.id,
          transactionType,
          entryType: EntryType.CREDIT,
          amount,
          description: `${description} (from user ${fromUserId})`,
          referenceId,
        },
        trx,
      );

      await trx.commit();

      this.logger.log(
        `User transfer: ${fromUserId} -> ${toUserId}, Amount ${amount}`,
        'WalletService',
      );
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      walletType?: 'main' | 'promo';
    },
  ) {
    let query = this.knex('ledger_entries')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');

    if (options?.walletType) {
      const wallet = await this.getWallet(userId, options.walletType);
      query = query.where({ wallet_id: wallet.id });
    }

    if (options?.startDate) {
      query = query.where('created_at', '>=', options.startDate);
    }

    if (options?.endDate) {
      query = query.where('created_at', '<=', options.endDate);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const entries = await query;

    return {
      transactions: entries,
      total: entries.length,
    };
  }

  /**
   * Validate withdrawal rules
   * - Promo balance cannot be withdrawn directly
   * - Must meet minimum withdrawal amount
   * - Must have sufficient main balance
   */
  async validateWithdrawal(userId: string, amount: number): Promise<void> {
    const minWithdrawal = parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT || '1000');

    if (amount < minWithdrawal) {
      throw new BadRequestException(
        `Minimum withdrawal amount is NGN ${minWithdrawal}`,
      );
    }

    const mainWallet = await this.getWallet(userId, 'main');
    const balance = parseFloat(mainWallet.balance);

    if (balance < amount) {
      throw new BadRequestException('Insufficient main wallet balance');
    }
  }
}
