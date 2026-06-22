import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CampaignService } from './campaign.service';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignController {
  constructor(private campaignService: CampaignService) {}

  @Get('active')
  async getActiveCampaigns(@Req() req: Request) {
    return this.campaignService.getActiveCampaigns((req as any).user.userId);
  }
}
