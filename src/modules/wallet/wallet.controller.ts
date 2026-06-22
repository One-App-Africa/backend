import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get('balance')
  async getBalance(@Req() req: Request) {
    const balance = await this.walletService.getBalance((req as any).user.userId);
    return {
      message: 'Wallet balance retrieved successfully',
      data: balance,
    };
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: Request,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('walletType') walletType?: 'main' | 'promo',
  ) {
    const history = await this.walletService.getTransactionHistory(
      (req as any).user.userId,
      {
        limit: limit ? parseInt(limit.toString()) : 50,
        offset: offset ? parseInt(offset.toString()) : 0,
        walletType,
      },
    );

    return {
      message: 'Transaction history retrieved successfully',
      data: history,
    };
  }
}
