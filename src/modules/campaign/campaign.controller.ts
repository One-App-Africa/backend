import { Controller, Get, Post, Body, Req, UseGuards, Param } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CampaignService } from './campaign.service';
import { EnrollCampaignDto } from './dto/enroll-campaign.dto';

@Controller('campaigns')
export class CampaignController {
  constructor(private campaignService: CampaignService) {}

  @Get('active')
  @UseGuards(JwtAuthGuard)
  async getActiveCampaigns(@Req() req: Request) {
    const campaigns = await this.campaignService.getActiveCampaigns(
      (req as any).user.userId,
    );

    return {
      message: 'Active campaigns retrieved successfully',
      data: campaigns,
    };
  }

  @Get('my-campaigns')
  @UseGuards(JwtAuthGuard)
  async getMyCampaigns(@Req() req: Request) {
    const result = await this.campaignService.getUserCampaigns(
      (req as any).user.userId,
    );

    return {
      message: 'Your campaigns retrieved successfully',
      data: result,
    };
  }

  @Get('first-5k/eligibility')
  @UseGuards(JwtAuthGuard)
  async checkFirst5KEligibility(@Req() req: Request) {
    const result = await this.campaignService.checkFirst5KEligibility(
      (req as any).user.userId,
    );

    return {
      message: 'Eligibility checked',
      data: result,
    };
  }

  @Post('enroll')
  @UseGuards(JwtAuthGuard)
  async enrollInCampaign(@Req() req: Request, @Body() enrollDto: EnrollCampaignDto) {
    const result = await this.campaignService.enrollInCampaign(
      (req as any).user.userId,
      enrollDto.campaignId,
    );

    return result;
  }

  @Get(':campaignId/stats')
  async getCampaignStats(@Param('campaignId') campaignId: string) {
    const result = await this.campaignService.getCampaignStats(campaignId);

    return {
      message: 'Campaign statistics retrieved successfully',
      data: result,
    };
  }
}
