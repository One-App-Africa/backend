import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaymentService } from './payment.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('deposit')
  async deposit(@Req() req: Request, @Body() depositData: any) {
    return this.paymentService.deposit((req as any).user.userId, depositData);
  }

  @Post('withdraw')
  async withdraw(@Req() req: Request, @Body() withdrawData: any) {
    return this.paymentService.withdraw((req as any).user.userId, withdrawData);
  }
}
