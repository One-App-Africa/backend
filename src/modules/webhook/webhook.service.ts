import { Injectable } from '@nestjs/common';
import { LoggerService } from '@/services/logger.service';
import { PaymentService } from '@/modules/payment/payment.service';

@Injectable()
export class WebhookService {
  constructor(
    private logger: LoggerService,
    private paymentService: PaymentService,
  ) {}

  async handleKycWebhook(data: any, headers: any) {
    this.logger.log('KYC webhook received', 'WebhookService');
    return { status: 'processed' };
  }

  async handlePaymentWebhook(data: any, headers: any) {
    const signature = headers['x-paystack-signature'];
    return await this.paymentService.handleWebhook(data, signature);
  }

  async handleCardWebhook(data: any, headers: any) {
    this.logger.log('Card webhook received', 'WebhookService');
    return { status: 'processed' };
  }

  async handleMetaWhatsAppWebhook(data: any, headers: any) {
    this.logger.log('Meta WhatsApp webhook received', 'WebhookService');
    return { status: 'processed' };
  }
}
