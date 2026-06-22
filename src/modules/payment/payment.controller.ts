import { Controller, Post, Get, Body, Req, UseGuards, Headers, Query } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaymentService } from './payment.service';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';
import { InitiateWithdrawalDto } from './dto/initiate-withdrawal.dto';
import { VerifyDepositDto } from './dto/verify-deposit.dto';

@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('deposit/initiate')
  @UseGuards(JwtAuthGuard)
  async initiateDeposit(@Req() req: Request, @Body() depositDto: InitiateDepositDto) {
    const result = await this.paymentService.initiateDeposit(
      (req as any).user.userId,
      depositDto.amount,
      depositDto.email,
    );

    return {
      message: 'Deposit initiated successfully',
      data: result,
    };
  }

  @Post('deposit/verify')
  @UseGuards(JwtAuthGuard)
  async verifyDeposit(@Body() verifyDto: VerifyDepositDto) {
    const result = await this.paymentService.verifyDeposit(verifyDto.reference);

    return result;
  }

  @Post('withdrawal/initiate')
  @UseGuards(JwtAuthGuard)
  async initiateWithdrawal(
    @Req() req: Request,
    @Body() withdrawalDto: InitiateWithdrawalDto,
  ) {
    const result = await this.paymentService.initiateWithdrawal(
      (req as any).user.userId,
      withdrawalDto.amount,
      withdrawalDto.bankCode,
      withdrawalDto.accountNumber,
      withdrawalDto.accountName,
    );

    return result;
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getPaymentHistory(
    @Req() req: Request,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.paymentService.getPaymentHistory(
      (req as any).user.userId,
      {
        limit: limit ? parseInt(limit.toString()) : 50,
        offset: offset ? parseInt(offset.toString()) : 0,
      },
    );

    return {
      message: 'Payment history retrieved successfully',
      data: result,
    };
  }
}
