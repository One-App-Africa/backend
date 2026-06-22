import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TransactionService } from './transaction.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  @Get()
  async getTransactions(@Req() req: Request, @Query() query: any) {
    return this.transactionService.getTransactions((req as any).user.userId, query);
  }
}
