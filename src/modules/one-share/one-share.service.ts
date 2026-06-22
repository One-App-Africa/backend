import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';
import { LedgerService, TransactionType } from '@/services/ledger.service';
import { WalletService } from '@/modules/wallet/wallet.service';

@Injectable()
export class OneShareService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
    private ledgerService: LedgerService,
    private walletService: WalletService,
  ) {}

  /**
   * Calculate One Share fee
   */
  private calculateFee(amount: number): number {
    const fixedFee = parseFloat(process.env.ONE_SHARE_ISSUANCE_FEE || '100');
    const percentFee = parseFloat(process.env.ONE_SHARE_ISSUANCE_FEE_PERCENT || '2');

    const percentAmount = (amount * percentFee) / 100;
    return fixedFee + percentAmount;
  }

  /**
   * Generate unique share code
   */
  private async generateShareCode(): Promise<string> {
    let code = '';
    let exists = true;

    while (exists) {
      // Generate 8-character alphanumeric code
      code = Math.random().toString(36).substring(2, 10).toUpperCase();

      const existing = await this.knex('one_shares')
        .where({ share_code: code })
        .first();

      exists = !!existing;
    }

    return code;
  }

  /**
   * Create One Share from main wallet
   */
  async createFromMainWallet(
    userId: string,
    amount: number,
    message?: string,
  ): Promise<any> {
    const maxAmount = parseFloat(process.env.MAX_ONE_SHARE_AMOUNT || '1000000');

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (amount > maxAmount) {
      throw new BadRequestException(`Maximum One Share amount is NGN ${maxAmount}`);
    }

    const trx = await this.knex.transaction();

    try {
      // Check KYC status
      const user = await trx('users').where({ id: userId }).first();

      if (user.kyc_status !== 'approved') {
        throw new ForbiddenException('KYC approval required to create One Share');
      }

      // Calculate fee
      const fee = this.calculateFee(amount);
      const totalAmount = amount + fee;

      // Validate balance
      const mainWallet = await this.walletService.getWallet(userId, 'main');
      const balance = parseFloat(mainWallet.balance);

      if (balance < totalAmount) {
        throw new BadRequestException('Insufficient balance');
      }

      // Generate share code and create One Share
      const shareCode = await this.generateShareCode();
      const expiryDays = parseInt(process.env.ONE_SHARE_EXPIRY_DAYS || '30');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      const transactionId = uuidv4();
      const oneShareId = uuidv4();

      // Create transaction record
      await trx('transactions').insert({
        id: transactionId,
        user_id: userId,
        transaction_type: 'one_share_create',
        amount,
        currency: 'NGN',
        fee,
        status: 'completed',
        reference: `OS-${shareCode}`,
        source_wallet_id: mainWallet.id,
        description: `One Share created: ${shareCode}`,
        completed_at: trx.fn.now(),
      });

      // Create One Share record
      await trx('one_shares').insert({
        id: oneShareId,
        creator_id: userId,
        amount,
        currency: 'NGN',
        fee,
        total_amount: totalAmount,
        share_code: shareCode,
        message: message || null,
        status: 'active',
        expires_at: expiresAt,
        transaction_id: transactionId,
      });

      // Debit main wallet (amount + fee)
      await this.walletService.debitMainWallet(
        userId,
        totalAmount,
        TransactionType.ONE_SHARE_CREATE,
        `One Share created: ${shareCode}`,
        transactionId,
        { share_code: shareCode, fee, amount },
      );

      await trx.commit();

      this.logger.log(
        `One Share created: ${shareCode} by user ${userId}, Amount: ${amount}`,
        'OneShareService',
      );

      return {
        id: oneShareId,
        shareCode,
        amount,
        fee,
        totalAmount,
        message,
        expiresAt,
        shareLink: `https://oneapp.africa/share/${shareCode}`,
      };
    } catch (error) {
      await trx.rollback();
      this.logger.error(
        `One Share creation failed: ${error.message}`,
        error.stack,
        'OneShareService',
      );
      throw error;
    }
  }

  /**
   * Create One Share from promo wallet
   * This allows promo balance to enter the network
   */
  async createFromPromoWallet(
    userId: string,
    amount: number,
    message?: string,
  ): Promise<any> {
    const trx = await this.knex.transaction();

    try {
      // Check promo balance
      const promoWallet = await this.walletService.getWallet(userId, 'promo');
      const promoBalance = parseFloat(promoWallet.balance);

      if (promoBalance < amount) {
        throw new BadRequestException('Insufficient promo balance');
      }

      // Calculate fee (will be deducted from main wallet if available, or added as debt)
      const fee = this.calculateFee(amount);

      // Transfer from promo to main first
      const transferRef = uuidv4();
      await this.walletService.transferPromoToMain(
        userId,
        amount,
        'Promo to One Share',
        transferRef,
      );

      await trx.commit();

      // Now create One Share from main wallet
      return await this.createFromMainWallet(userId, amount, message);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Claim One Share
   */
  async claimOneShare(claimerId: string, shareCode: string): Promise<any> {
    const trx = await this.knex.transaction();

    try {
      // Get One Share
      const oneShare = await trx('one_shares')
        .where({ share_code: shareCode })
        .first();

      if (!oneShare) {
        throw new NotFoundException('One Share not found');
      }

      // Validate One Share
      if (oneShare.status !== 'active') {
        throw new BadRequestException(`One Share is ${oneShare.status}`);
      }

      if (new Date() > new Date(oneShare.expires_at)) {
        // Mark as expired
        await trx('one_shares')
          .where({ id: oneShare.id })
          .update({ status: 'expired' });

        throw new BadRequestException('One Share has expired');
      }

      if (oneShare.creator_id === claimerId) {
        throw new BadRequestException('Cannot claim your own One Share');
      }

      // Check if claimer exists or needs to register
      const claimer = await trx('users').where({ id: claimerId }).first();

      if (!claimer) {
        throw new NotFoundException('Claimer user not found');
      }

      // Transfer amount from creator to claimer
      const transactionId = uuidv4();

      await this.walletService.transferBetweenUsers(
        oneShare.creator_id,
        claimerId,
        parseFloat(oneShare.amount),
        TransactionType.ONE_SHARE_CLAIM,
        `One Share claimed: ${shareCode}`,
        transactionId,
      );

      // Update One Share status
      await trx('one_shares')
        .where({ id: oneShare.id })
        .update({
          status: 'claimed',
          claimed_by: claimerId,
          claimed_at: trx.fn.now(),
        });

      // Create transaction record
      await trx('transactions').insert({
        id: transactionId,
        user_id: claimerId,
        transaction_type: 'one_share_claim',
        amount: oneShare.amount,
        currency: 'NGN',
        fee: 0,
        status: 'completed',
        reference: `OSC-${shareCode}`,
        description: `One Share claimed: ${shareCode}`,
        completed_at: trx.fn.now(),
      });

      await trx.commit();

      this.logger.log(
        `One Share claimed: ${shareCode} by user ${claimerId}`,
        'OneShareService',
      );

      return {
        message: 'One Share claimed successfully',
        amount: parseFloat(oneShare.amount),
        from: oneShare.creator_id,
        shareCode,
      };
    } catch (error) {
      await trx.rollback();
      this.logger.error(
        `One Share claim failed: ${error.message}`,
        error.stack,
        'OneShareService',
      );
      throw error;
    }
  }

  /**
   * Get One Share details
   */
  async getOneShare(shareCode: string) {
    const oneShare = await this.knex('one_shares')
      .where({ share_code: shareCode })
      .first();

    if (!oneShare) {
      throw new NotFoundException('One Share not found');
    }

    // Get creator info
    const creator = await this.knex('users')
      .where({ id: oneShare.creator_id })
      .select('first_name', 'last_name')
      .first();

    return {
      shareCode: oneShare.share_code,
      amount: parseFloat(oneShare.amount),
      message: oneShare.message,
      status: oneShare.status,
      createdAt: oneShare.created_at,
      expiresAt: oneShare.expires_at,
      creator: {
        firstName: creator.first_name,
        lastName: creator.last_name,
      },
      isExpired: new Date() > new Date(oneShare.expires_at),
      isClaimed: oneShare.status === 'claimed',
    };
  }

  /**
   * Get user's One Shares (created)
   */
  async getMyShares(userId: string) {
    const shares = await this.knex('one_shares')
      .where({ creator_id: userId })
      .orderBy('created_at', 'desc');

    return {
      shares: shares.map(share => ({
        id: share.id,
        shareCode: share.share_code,
        amount: parseFloat(share.amount),
        fee: parseFloat(share.fee),
        message: share.message,
        status: share.status,
        createdAt: share.created_at,
        expiresAt: share.expires_at,
        claimedAt: share.claimed_at,
        shareLink: `https://oneapp.africa/share/${share.share_code}`,
      })),
      total: shares.length,
    };
  }

  /**
   * Get One Shares received by user
   */
  async getReceivedShares(userId: string) {
    const shares = await this.knex('one_shares')
      .where({ claimed_by: userId, status: 'claimed' })
      .orderBy('claimed_at', 'desc');

    return {
      shares: shares.map(share => ({
        id: share.id,
        shareCode: share.share_code,
        amount: parseFloat(share.amount),
        message: share.message,
        claimedAt: share.claimed_at,
      })),
      total: shares.length,
    };
  }

  /**
   * Cancel One Share (only if not claimed)
   */
  async cancelOneShare(userId: string, shareCode: string): Promise<void> {
    const trx = await this.knex.transaction();

    try {
      const oneShare = await trx('one_shares')
        .where({ share_code: shareCode })
        .first();

      if (!oneShare) {
        throw new NotFoundException('One Share not found');
      }

      if (oneShare.creator_id !== userId) {
        throw new ForbiddenException('Not authorized to cancel this One Share');
      }

      if (oneShare.status === 'claimed') {
        throw new BadRequestException('Cannot cancel claimed One Share');
      }

      if (oneShare.status === 'cancelled') {
        throw new BadRequestException('One Share already cancelled');
      }

      // Refund amount + fee to creator's main wallet
      const refundAmount = parseFloat(oneShare.total_amount);
      const refundRef = uuidv4();

      await this.walletService.creditMainWallet(
        userId,
        refundAmount,
        TransactionType.REFUND,
        `One Share cancelled: ${shareCode}`,
        refundRef,
        { share_code: shareCode },
      );

      // Update One Share status
      await trx('one_shares')
        .where({ id: oneShare.id })
        .update({ status: 'cancelled' });

      await trx.commit();

      this.logger.log(
        `One Share cancelled: ${shareCode} by user ${userId}`,
        'OneShareService',
      );
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}
