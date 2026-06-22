import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { OneShareService } from './one-share.service';

@Controller('one-share')
@UseGuards(JwtAuthGuard)
export class OneShareController {
  constructor(private oneShareService: OneShareService) {}

  @Post('create')
  async createOneShare(@Req() req: Request, @Body() createData: any) {
    return this.oneShareService.createOneShare((req as any).user.userId, createData);
  }

  @Get('my-shares')
  async getMyShares(@Req() req: Request) {
    return this.oneShareService.getMyShares((req as any).user.userId);
  }
}
