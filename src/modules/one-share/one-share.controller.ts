import { Controller, Post, Get, Body, Req, UseGuards, Param, Delete } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { OneShareService } from './one-share.service';
import { CreateOneShareDto } from './dto/create-one-share.dto';
import { ClaimOneShareDto } from './dto/claim-one-share.dto';

@Controller('one-share')
export class OneShareController {
  constructor(private oneShareService: OneShareService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createOneShare(@Req() req: Request, @Body() createDto: CreateOneShareDto) {
    const userId = (req as any).user.userId;

    let result;
    if (createDto.fromWallet === 'promo') {
      result = await this.oneShareService.createFromPromoWallet(
        userId,
        createDto.amount,
        createDto.message,
      );
    } else {
      result = await this.oneShareService.createFromMainWallet(
        userId,
        createDto.amount,
        createDto.message,
      );
    }

    return {
      message: 'One Share created successfully',
      data: result,
    };
  }

  @Post('claim')
  @UseGuards(JwtAuthGuard)
  async claimOneShare(@Req() req: Request, @Body() claimDto: ClaimOneShareDto) {
    const result = await this.oneShareService.claimOneShare(
      (req as any).user.userId,
      claimDto.shareCode,
    );

    return result;
  }

  @Get('my-shares')
  @UseGuards(JwtAuthGuard)
  async getMyShares(@Req() req: Request) {
    const result = await this.oneShareService.getMyShares((req as any).user.userId);

    return {
      message: 'One Shares retrieved successfully',
      data: result,
    };
  }

  @Get('received')
  @UseGuards(JwtAuthGuard)
  async getReceivedShares(@Req() req: Request) {
    const result = await this.oneShareService.getReceivedShares(
      (req as any).user.userId,
    );

    return {
      message: 'Received One Shares retrieved successfully',
      data: result,
    };
  }

  @Get(':shareCode')
  async getOneShare(@Param('shareCode') shareCode: string) {
    const result = await this.oneShareService.getOneShare(shareCode);

    return {
      message: 'One Share details retrieved successfully',
      data: result,
    };
  }

  @Delete(':shareCode')
  @UseGuards(JwtAuthGuard)
  async cancelOneShare(@Req() req: Request, @Param('shareCode') shareCode: string) {
    await this.oneShareService.cancelOneShare((req as any).user.userId, shareCode);

    return {
      message: 'One Share cancelled successfully',
    };
  }
}
