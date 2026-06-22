import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { KycService } from './kyc.service';

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private kycService: KycService) {}

  @Post('submit')
  async submitKyc(@Req() req: Request, @Body() kycData: any) {
    return this.kycService.submitKyc((req as any).user.userId, kycData);
  }

  @Get('status')
  async getKycStatus(@Req() req: Request) {
    return this.kycService.getKycStatus((req as any).user.userId);
  }
}
