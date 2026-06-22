import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  ONE_SHARE_CREATE = 'one_share_create',
  ONE_SHARE_CLAIM = 'one_share_claim',
  CARD_FUNDING = 'card_funding',
  CARD_TRANSACTION = 'card_transaction',
  TRANSFER = 'transfer',
  FEE = 'fee',
  PROMO_CREDIT = 'promo_credit',
  REFUND = 'refund',
}

export enum EntryType {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

interface LedgerEntry {
  userId: string;
  walletId: string;
  transactionType: TransactionType;
  entryType: EntryType;
  amount: number;
  description: string;
  referenceId: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class LedgerService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  /**
   * Record a double-entry transaction
   * This is the core method that ensures all financial transactions are properly recorded
   */
  async recordTransaction(
    debitEntry: LedgerEntry,
    creditEntry: LedgerEntry,
    trx?: Knex.Transaction,
  ): Promise<{ debitLedgerId: string; creditLedgerId: string }> {
    const useTransaction = trx || this.knex;

    // Validate amounts match
    if (debitEntry.amount !== creditEntry.amount) {
      throw new BadRequestException('Debit and credit amounts must match');
    }

    // Validate reference IDs match
    if (debitEntry.referenceId !== creditEntry.referenceId) {
      throw new BadRequestException('Reference IDs must match for double-entry');
    }

    try {
      // Get wallet balances
      const debitWallet = await useTransaction('wallets')
        .where({ id: debitEntry.walletId })
        .first();

      const creditWallet = await useTransaction('wallets')
        .where({ id: creditEntry.walletId })
        .first();

      if (!debitWallet || !creditWallet) {
        throw new BadRequestException('Wallet not found');
      }

      // Calculate new balances
      const newDebitBalance = parseFloat(debitWallet.balance) - debitEntry.amount;
      const newCreditBalance = parseFloat(creditWallet.balance) + creditEntry.amount;

      // Check for sufficient balance
      if (newDebitBalance < 0) {
        throw new BadRequestException('Insufficient balance');
      }

      // Update wallet balances
      await useTransaction('wallets')
        .where({ id: debitEntry.walletId })
        .update({ balance: newDebitBalance, updated_at: useTransaction.fn.now() });

      await useTransaction('wallets')
        .where({ id: creditEntry.walletId })
        .update({ balance: newCreditBalance, updated_at: useTransaction.fn.now() });

      // Record debit entry
      const [debitLedger] = await useTransaction('ledger_entries')
        .insert({
          id: uuidv4(),
          user_id: debitEntry.userId,
          wallet_id: debitEntry.walletId,
          transaction_type: debitEntry.transactionType,
          entry_type: EntryType.DEBIT,
          amount: debitEntry.amount,
          balance_after: newDebitBalance,
          currency: 'NGN',
          reference_id: debitEntry.referenceId,
          description: debitEntry.description,
          metadata: debitEntry.metadata || {},
        })
        .returning('id');

      // Record credit entry
      const [creditLedger] = await useTransaction('ledger_entries')
        .insert({
          id: uuidv4(),
          user_id: creditEntry.userId,
          wallet_id: creditEntry.walletId,
          transaction_type: creditEntry.transactionType,
          entry_type: EntryType.CREDIT,
          amount: creditEntry.amount,
          balance_after: newCreditBalance,
          currency: 'NGN',
          reference_id: creditEntry.referenceId,
          description: creditEntry.description,
          metadata: creditEntry.metadata || {},
        })
        .returning('id');

      this.logger.log(
        `Double-entry recorded: ${debitEntry.referenceId} - ${debitEntry.transactionType}`,
        'LedgerService',
      );

      return {
        debitLedgerId: debitLedger.id,
        creditLedgerId: creditLedger.id,
      };
    } catch (error) {
      this.logger.error(
        `Ledger transaction failed: ${error.message}`,
        error.stack,
        'LedgerService',
      );
      throw error;
    }
  }

  /**
   * Record a single-sided entry (for system accounts)
   */
  async recordSingleEntry(
    entry: LedgerEntry,
    trx?: Knex.Transaction,
  ): Promise<string> {
    const useTransaction = trx || this.knex;

    try {
      const wallet = await useTransaction('wallets')
        .where({ id: entry.walletId })
        .first();

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      // Calculate new balance based on entry type
      let newBalance: number;
      if (entry.entryType === EntryType.DEBIT) {
        newBalance = parseFloat(wallet.balance) - entry.amount;
      } else {
        newBalance = parseFloat(wallet.balance) + entry.amount;
      }

      // Check for sufficient balance on debit
      if (entry.entryType === EntryType.DEBIT && newBalance < 0) {
        throw new BadRequestException('Insufficient balance');
      }

      // Update wallet balance
      await useTransaction('wallets')
        .where({ id: entry.walletId })
        .update({ balance: newBalance, updated_at: useTransaction.fn.now() });

      // Record ledger entry
      const [ledger] = await useTransaction('ledger_entries')
        .insert({
          id: uuidv4(),
          user_id: entry.userId,
          wallet_id: entry.walletId,
          transaction_type: entry.transactionType,
          entry_type: entry.entryType,
          amount: entry.amount,
          balance_after: newBalance,
          currency: 'NGN',
          reference_id: entry.referenceId,
          description: entry.description,
          metadata: entry.metadata || {},
        })
        .returning('id');

      this.logger.log(
        `Single entry recorded: ${entry.referenceId} - ${entry.transactionType}`,
        'LedgerService',
      );

      return ledger.id;
    } catch (error) {
      this.logger.error(
        `Single ledger entry failed: ${error.message}`,
        error.stack,
        'LedgerService',
      );
      throw error;
    }
  }

  /**
   * Get ledger entries for a user
   */
  async getUserLedgerEntries(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      transactionType?: TransactionType;
    },
  ) {
    const query = this.knex('ledger_entries')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');

    if (options?.startDate) {
      query.where('created_at', '>=', options.startDate);
    }

    if (options?.endDate) {
      query.where('created_at', '<=', options.endDate);
    }

    if (options?.transactionType) {
      query.where('transaction_type', options.transactionType);
    }

    if (options?.limit) {
      query.limit(options.limit);
    }

    if (options?.offset) {
      query.offset(options.offset);
    }

    return query;
  }

  /**
   * Get wallet balance (for verification)
   */
  async getWalletBalance(walletId: string): Promise<number> {
    const wallet = await this.knex('wallets')
      .where({ id: walletId })
      .first();

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    return parseFloat(wallet.balance);
  }

  /**
   * Verify ledger integrity for a wallet
   * This checks that the balance matches the sum of all ledger entries
   */
  async verifyWalletLedger(walletId: string): Promise<{
    isValid: boolean;
    walletBalance: number;
    calculatedBalance: number;
    difference: number;
  }> {
    const wallet = await this.knex('wallets')
      .where({ id: walletId })
      .first();

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    // Calculate balance from ledger entries
    const entries = await this.knex('ledger_entries')
      .where({ wallet_id: walletId })
      .orderBy('created_at', 'asc');

    let calculatedBalance = 0;
    for (const entry of entries) {
      if (entry.entry_type === EntryType.CREDIT) {
        calculatedBalance += parseFloat(entry.amount);
      } else {
        calculatedBalance -= parseFloat(entry.amount);
      }
    }

    const walletBalance = parseFloat(wallet.balance);
    const difference = Math.abs(walletBalance - calculatedBalance);

    return {
      isValid: difference < 0.01, // Allow for floating point precision
      walletBalance,
      calculatedBalance,
      difference,
    };
  }
}
