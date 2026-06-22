import { Controller, Post, Body, Headers } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  @Post('kyc')
  async handleKycWebhook(@Body() data: any, @Headers() headers: any) {
    return this.webhookService.handleKycWebhook(data, headers);
  }

  @Post('payment')
  async handlePaymentWebhook(@Body() data: any, @Headers() headers: any) {
    return this.webhookService.handlePaymentWebhook(data, headers);
  }

  @Post('card')
  async handleCardWebhook(@Body() data: any, @Headers() headers: any) {
    return this.webhookService.handleCardWebhook(data, headers);
  }

  @Post('twilio')
  async handleTwilioWebhook(@Body() data: any) {
    return this.webhookService.handleTwilioWebhook(data);
  }
}
