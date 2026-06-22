import { Controller, Post, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CardService } from './card.service';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardController {
  constructor(private cardService: CardService) {}

  @Post('create')
  async createCard(@Req() req: Request) {
    return this.cardService.createCard((req as any).user.userId);
  }

  @Get('my-cards')
  async getMyCards(@Req() req: Request) {
    return this.cardService.getMyCards((req as any).user.userId);
  }
}
