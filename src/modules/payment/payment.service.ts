import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';
import { LedgerService, TransactionType } from '@/services/ledger.service';
import { WalletService } from '@/modules/wallet/wallet.service';

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    customer: {
      email: string;
    };
  };
}

@Injectable()
export class PaymentService {
  private paystackSecretKey: string;
  private paystackBaseUrl: string;

  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private configService: ConfigService,
    private logger: LoggerService,
    private ledgerService: LedgerService,
    private walletService: WalletService,
  ) {
    this.paystackSecretKey = this.configService.get('PAYMENT_SECRET_KEY') || '';
    this.paystackBaseUrl = this.configService.get('PAYMENT_API_URL') || 'https://api.paystack.co';
  }

  /**
   * Initialize deposit with Paystack
   */
  async initiateDeposit(userId: string, amount: number, email: string) {
    if (amount < 100) {
      throw new BadRequestException('Minimum deposit amount is NGN 100');
    }

    try {
      const reference = `DEP-${uuidv4()}`;
      const amountInKobo = Math.round(amount * 100);

      // Create payment record
      const paymentId = uuidv4();
      await this.knex('payments').insert({
        id: paymentId,
        user_id: userId,
        payment_type: 'deposit',
        payment_method: 'paystack',
        amount,
        currency: 'NGN',
        fee: 0,
        status: 'pending',
        reference,
        provider: 'paystack',
      });

      // Initialize Paystack transaction
      const response = await axios.post<PaystackInitializeResponse>(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email,
          amount: amountInKobo,
          reference,
          callback_url: `${this.configService.get('API_URL')}/api/v1/payments/callback`,
          metadata: {
            user_id: userId,
            payment_id: paymentId,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data.status) {
        throw new InternalServerErrorException('Failed to initialize payment');
      }

      this.logger.log(
        `Deposit initiated: User ${userId}, Amount ${amount}, Reference ${reference}`,
        'PaymentService',
      );

      return {
        paymentId,
        reference,
        authorizationUrl: response.data.data.authorization_url,
        accessCode: response.data.data.access_code,
      };
    } catch (error) {
      this.logger.error(
        `Deposit initiation failed: ${error.message}`,
        error.stack,
        'PaymentService',
      );
      throw new InternalServerErrorException('Failed to initiate deposit');
    }
  }

  /**
   * Verify and complete deposit
   */
  async verifyDeposit(reference: string) {
    try {
      // Verify with Paystack
      const response = await axios.get<PaystackVerifyResponse>(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException('Payment verification failed');
      }

      const { data } = response.data;

      if (data.status !== 'success') {
        throw new BadRequestException(`Payment status: ${data.status}`);
      }

      // Get payment record
      const payment = await this.knex('payments')
        .where({ reference })
        .first();

      if (!payment) {
        throw new BadRequestException('Payment not found');
      }

      if (payment.status === 'completed') {
        return {
          message: 'Payment already processed',
          amount: parseFloat(payment.amount),
        };
      }

      // Convert from kobo to naira
      const amount = data.amount / 100;

      // Start transaction
      const trx = await this.knex.transaction();

      try {
        // Create transaction record
        const transactionId = uuidv4();
        await trx('transactions').insert({
          id: transactionId,
          user_id: payment.user_id,
          transaction_type: 'deposit',
          amount,
          currency: 'NGN',
          fee: 0,
          status: 'completed',
          reference: `TXN-${reference}`,
          external_reference: reference,
          description: 'Wallet deposit via Paystack',
          completed_at: trx.fn.now(),
        });

        // Credit main wallet
        await this.walletService.creditMainWallet(
          payment.user_id,
          amount,
          TransactionType.DEPOSIT,
          'Deposit via Paystack',
          transactionId,
          { payment_reference: reference },
        );

        // Update payment record
        await trx('payments')
          .where({ id: payment.id })
          .update({
            status: 'completed',
            transaction_id: transactionId,
            provider_response: response.data,
            completed_at: trx.fn.now(),
          });

        await trx.commit();

        this.logger.log(
          `Deposit completed: User ${payment.user_id}, Amount ${amount}, Reference ${reference}`,
          'PaymentService',
        );

        return {
          message: 'Deposit successful',
          amount,
          reference,
        };
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Deposit verification failed: ${error.message}`,
        error.stack,
        'PaymentService',
      );
      throw error;
    }
  }

  /**
   * Initiate withdrawal
   */
  async initiateWithdrawal(
    userId: string,
    amount: number,
    bankCode: string,
    accountNumber: string,
    accountName: string,
  ) {
    // Validate withdrawal
    await this.walletService.validateWithdrawal(userId, amount);

    // Calculate fee
    const fixedFee = parseFloat(process.env.WITHDRAWAL_FEE_FIXED || '50');
    const percentFee = parseFloat(process.env.WITHDRAWAL_FEE_PERCENT || '1');
    const fee = fixedFee + (amount * percentFee) / 100;
    const totalAmount = amount + fee;

    const trx = await this.knex.transaction();

    try {
      const reference = `WDR-${uuidv4()}`;
      const paymentId = uuidv4();
      const transactionId = uuidv4();

      // Create payment record
      await trx('payments').insert({
        id: paymentId,
        user_id: userId,
        payment_type: 'withdrawal',
        payment_method: 'bank_transfer',
        amount,
        currency: 'NGN',
        fee,
        status: 'processing',
        reference,
        provider: 'paystack',
      });

      // Create transaction record
      await trx('transactions').insert({
        id: transactionId,
        user_id: userId,
        transaction_type: 'withdrawal',
        amount,
        currency: 'NGN',
        fee,
        status: 'processing',
        reference: `TXN-${reference}`,
        description: `Withdrawal to ${accountNumber}`,
      });

      // Debit main wallet (amount + fee)
      await this.walletService.debitMainWallet(
        userId,
        totalAmount,
        TransactionType.WITHDRAWAL,
        `Withdrawal to ${accountNumber}`,
        transactionId,
        {
          bank_code: bankCode,
          account_number: accountNumber,
          account_name: accountName,
          fee,
        },
      );

      // Initiate transfer with Paystack
      const amountInKobo = Math.round(amount * 100);

      const transferResponse = await axios.post(
        `${this.paystackBaseUrl}/transfer`,
        {
          source: 'balance',
          amount: amountInKobo,
          reference,
          recipient: accountNumber,
          reason: 'Withdrawal from One App',
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Update payment with external reference
      await trx('payments')
        .where({ id: paymentId })
        .update({
          external_reference: transferResponse.data.data?.transfer_code,
          provider_response: transferResponse.data,
        });

      await trx.commit();

      this.logger.log(
        `Withdrawal initiated: User ${userId}, Amount ${amount}, Reference ${reference}`,
        'PaymentService',
      );

      return {
        message: 'Withdrawal initiated successfully',
        reference,
        amount,
        fee,
        totalAmount,
        status: 'processing',
      };
    } catch (error) {
      await trx.rollback();
      this.logger.error(
        `Withdrawal initiation failed: ${error.message}`,
        error.stack,
        'PaymentService',
      );
      throw new InternalServerErrorException('Failed to initiate withdrawal');
    }
  }

  /**
   * Handle Paystack webhook
   */
  async handleWebhook(payload: any, signature: string) {
    // Verify webhook signature
    const webhookSecret = this.configService.get('PAYMENT_WEBHOOK_SECRET');
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha512', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const { event, data } = payload;

    this.logger.log(`Paystack webhook received: ${event}`, 'PaymentService');

    switch (event) {
      case 'charge.success':
        await this.handleChargeSuccess(data);
        break;
      case 'transfer.success':
        await this.handleTransferSuccess(data);
        break;
      case 'transfer.failed':
        await this.handleTransferFailed(data);
        break;
      default:
        this.logger.log(`Unhandled webhook event: ${event}`, 'PaymentService');
    }

    return { status: 'success' };
  }

  private async handleChargeSuccess(data: any) {
    const reference = data.reference;
    await this.verifyDeposit(reference);
  }

  private async handleTransferSuccess(data: any) {
    const reference = data.reference;

    const payment = await this.knex('payments')
      .where({ reference })
      .first();

    if (!payment) {
      return;
    }

    await this.knex('payments')
      .where({ id: payment.id })
      .update({
        status: 'completed',
        completed_at: this.knex.fn.now(),
      });

    await this.knex('transactions')
      .where({ id: payment.transaction_id })
      .update({
        status: 'completed',
        completed_at: this.knex.fn.now(),
      });

    this.logger.log(
      `Withdrawal completed: Reference ${reference}`,
      'PaymentService',
    );
  }

  private async handleTransferFailed(data: any) {
    const reference = data.reference;

    const payment = await this.knex('payments')
      .where({ reference })
      .first();

    if (!payment) {
      return;
    }

    const trx = await this.knex.transaction();

    try {
      // Refund to user's wallet
      const totalAmount = parseFloat(payment.amount) + parseFloat(payment.fee);

      await this.walletService.creditMainWallet(
        payment.user_id,
        totalAmount,
        TransactionType.REFUND,
        `Withdrawal refund: ${reference}`,
        uuidv4(),
        { original_reference: reference },
      );

      // Update payment status
      await trx('payments')
        .where({ id: payment.id })
        .update({ status: 'failed' });

      await trx('transactions')
        .where({ id: payment.transaction_id })
        .update({ status: 'failed' });

      await trx.commit();

      this.logger.log(
        `Withdrawal failed and refunded: Reference ${reference}`,
        'PaymentService',
      );
    } catch (error) {
      await trx.rollback();
      this.logger.error(
        `Failed to process transfer failure: ${error.message}`,
        error.stack,
        'PaymentService',
      );
    }
  }

  /**
   * Get user's payment history
   */
  async getPaymentHistory(userId: string, options?: { limit?: number; offset?: number }) {
    const query = this.knex('payments')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');

    if (options?.limit) {
      query.limit(options.limit);
    }

    if (options?.offset) {
      query.offset(options.offset);
    }

    const payments = await query;

    return {
      payments: payments.map(p => ({
        id: p.id,
        type: p.payment_type,
        amount: parseFloat(p.amount),
        fee: parseFloat(p.fee),
        status: p.status,
        reference: p.reference,
        createdAt: p.created_at,
        completedAt: p.completed_at,
      })),
      total: payments.length,
    };
  }
}
