import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';
import { WalletService } from '@/modules/wallet/wallet.service';

@Injectable()
export class CampaignService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private configService: ConfigService,
    private logger: LoggerService,
    private walletService: WalletService,
  ) {}

  /**
   * Get active campaigns
   */
  async getActiveCampaigns(userId?: string) {
    const knex = this.knex;
    const campaigns = await this.knex('campaigns')
      .where({ status: 'active' })
      .where('starts_at', '<=', this.knex.fn.now())
      .where(function () {
        this.whereNull('ends_at').orWhere('ends_at', '>=', knex.fn.now());
      });

    // If userId provided, check participation status
    if (userId) {
      const participations = await this.knex('campaign_participants')
        .where({ user_id: userId })
        .select('campaign_id', 'status', 'reward_claimed');

      const participationMap = new Map(
        participations.map(p => [p.campaign_id, p]),
      );

      return campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        campaignType: campaign.campaign_type,
        rewardAmount: parseFloat(campaign.reward_amount),
        rewardType: campaign.reward_type,
        maxParticipants: campaign.max_participants,
        currentParticipants: campaign.current_participants,
        spotsRemaining: campaign.max_participants - campaign.current_participants,
        endsAt: campaign.ends_at,
        isParticipating: participationMap.has(campaign.id),
        participationStatus: participationMap.get(campaign.id)?.status,
        rewardClaimed: participationMap.get(campaign.id)?.reward_claimed || false,
      }));
    }

    return campaigns.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      campaignType: campaign.campaign_type,
      rewardAmount: parseFloat(campaign.reward_amount),
      rewardType: campaign.reward_type,
      maxParticipants: campaign.max_participants,
      currentParticipants: campaign.current_participants,
      spotsRemaining: campaign.max_participants - campaign.current_participants,
      endsAt: campaign.ends_at,
    }));
  }

  /**
   * Check if user is eligible for First 5K campaign
   */
  async checkFirst5KEligibility(userId: string): Promise<{
    isEligible: boolean;
    reason?: string;
    campaign?: any;
  }> {
    // Get First 5K campaign
    const campaign = await this.knex('campaigns')
      .where({ campaign_type: 'signup_bonus', status: 'active' })
      .where('name', 'like', '%First 5,000%')
      .first();

    if (!campaign) {
      return {
        isEligible: false,
        reason: 'Campaign not found or inactive',
      };
    }

    // Check if campaign is full
    if (campaign.current_participants >= campaign.max_participants) {
      return {
        isEligible: false,
        reason: 'Campaign is full',
      };
    }

    // Check if user already participated
    const participation = await this.knex('campaign_participants')
      .where({ campaign_id: campaign.id, user_id: userId })
      .first();

    if (participation) {
      return {
        isEligible: false,
        reason: 'Already participated in this campaign',
      };
    }

    return {
      isEligible: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        rewardAmount: parseFloat(campaign.reward_amount),
        spotsRemaining: campaign.max_participants - campaign.current_participants,
      },
    };
  }

  /**
   * Enroll user in First 5K campaign
   * This is automatically called during user registration
   */
  async enrollInFirst5K(userId: string): Promise<void> {
    const eligibility = await this.checkFirst5KEligibility(userId);

    if (!eligibility.isEligible) {
      this.logger.log(
        `User ${userId} not eligible for First 5K: ${eligibility.reason}`,
        'CampaignService',
      );
      return;
    }

    const trx = await this.knex.transaction();

    try {
      const campaign = eligibility.campaign;
      const rewardAmount = parseFloat(
        this.configService.get('FIRST_5K_PROMO_AMOUNT') || '5000',
      );

      // Create participation record
      await trx('campaign_participants').insert({
        id: uuidv4(),
        campaign_id: campaign.id,
        user_id: userId,
        status: 'enrolled',
        reward_claimed: false,
      });

      // Update campaign participant count
      await trx('campaigns')
        .where({ id: campaign.id })
        .increment('current_participants', 1);

      // Credit promo wallet
      const referenceId = uuidv4();
      await this.walletService.creditPromoWallet(
        userId,
        rewardAmount,
        'First 5K Users Promo Reward',
        referenceId,
        { campaign_id: campaign.id, campaign_name: campaign.name },
      );

      // Mark reward as claimed
      await trx('campaign_participants')
        .where({ campaign_id: campaign.id, user_id: userId })
        .update({
          reward_claimed: true,
          reward_claimed_at: trx.fn.now(),
          status: 'completed',
        });

      await trx.commit();

      this.logger.log(
        `User ${userId} enrolled in First 5K campaign and received NGN ${rewardAmount}`,
        'CampaignService',
      );
    } catch (error) {
      await trx.rollback();
      this.logger.error(
        `Failed to enroll user in First 5K: ${error.message}`,
        error.stack,
        'CampaignService',
      );
      throw error;
    }
  }

  /**
   * Enroll in a campaign
   */
  async enrollInCampaign(userId: string, campaignId: string) {
    const campaign = await this.knex('campaigns')
      .where({ id: campaignId })
      .first();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status !== 'active') {
      throw new BadRequestException('Campaign is not active');
    }

    if (campaign.current_participants >= campaign.max_participants) {
      throw new BadRequestException('Campaign is full');
    }

    // Check if already enrolled
    const existing = await this.knex('campaign_participants')
      .where({ campaign_id: campaignId, user_id: userId })
      .first();

    if (existing) {
      throw new BadRequestException('Already enrolled in this campaign');
    }

    const trx = await this.knex.transaction();

    try {
      // Create participation record
      await trx('campaign_participants').insert({
        id: uuidv4(),
        campaign_id: campaignId,
        user_id: userId,
        status: 'enrolled',
      });

      // Update participant count
      await trx('campaigns')
        .where({ id: campaignId })
        .increment('current_participants', 1);

      await trx.commit();

      this.logger.log(
        `User ${userId} enrolled in campaign ${campaignId}`,
        'CampaignService',
      );

      return {
        message: 'Successfully enrolled in campaign',
        campaign: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
        },
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get user's campaign participation
   */
  async getUserCampaigns(userId: string) {
    const participations = await this.knex('campaign_participants as cp')
      .join('campaigns as c', 'cp.campaign_id', 'c.id')
      .where({ 'cp.user_id': userId })
      .select(
        'c.id',
        'c.name',
        'c.description',
        'c.campaign_type',
        'c.reward_amount',
        'c.reward_type',
        'cp.status',
        'cp.reward_claimed',
        'cp.reward_claimed_at',
        'cp.joined_at',
      )
      .orderBy('cp.joined_at', 'desc');

    return {
      campaigns: participations.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        campaignType: p.campaign_type,
        rewardAmount: parseFloat(p.reward_amount),
        rewardType: p.reward_type,
        status: p.status,
        rewardClaimed: p.reward_claimed,
        rewardClaimedAt: p.reward_claimed_at,
        joinedAt: p.joined_at,
      })),
      total: participations.length,
    };
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string) {
    const campaign = await this.knex('campaigns')
      .where({ id: campaignId })
      .first();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const participants = await this.knex('campaign_participants')
      .where({ campaign_id: campaignId })
      .count('* as total')
      .first();

    const rewardsClaimed = await this.knex('campaign_participants')
      .where({ campaign_id: campaignId, reward_claimed: true })
      .count('* as total')
      .first();

    const statusBreakdown = await this.knex('campaign_participants')
      .where({ campaign_id: campaignId })
      .select('status')
      .count('* as count')
      .groupBy('status');

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        maxParticipants: campaign.max_participants,
        currentParticipants: campaign.current_participants,
        rewardAmount: parseFloat(campaign.reward_amount),
      },
      stats: {
        totalParticipants: parseInt((participants?.total as string) || '0'),
        rewardsClaimed: parseInt((rewardsClaimed?.total as string) || '0'),
        spotsRemaining: campaign.max_participants - campaign.current_participants,
        statusBreakdown: statusBreakdown.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count as string);
          return acc;
        }, {} as Record<string, number>),
      },
    };
  }

  /**
   * Admin: Create new campaign
   */
  async createCampaign(data: {
    name: string;
    description: string;
    campaignType: string;
    rewardAmount: number;
    rewardType: string;
    maxParticipants: number;
    startsAt?: Date;
    endsAt?: Date;
  }) {
    const campaignId = uuidv4();

    await this.knex('campaigns').insert({
      id: campaignId,
      name: data.name,
      description: data.description,
      campaign_type: data.campaignType,
      reward_amount: data.rewardAmount,
      reward_type: data.rewardType,
      max_participants: data.maxParticipants,
      current_participants: 0,
      status: 'active',
      starts_at: data.startsAt || this.knex.fn.now(),
      ends_at: data.endsAt,
    });

    this.logger.log(`Campaign created: ${data.name} (${campaignId})`, 'CampaignService');

    return {
      message: 'Campaign created successfully',
      campaignId,
    };
  }

  /**
   * Admin: Update campaign status
   */
  async updateCampaignStatus(campaignId: string, status: string) {
    const campaign = await this.knex('campaigns')
      .where({ id: campaignId })
      .first();

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    await this.knex('campaigns')
      .where({ id: campaignId })
      .update({ status });

    this.logger.log(
      `Campaign ${campaignId} status updated to ${status}`,
      'CampaignService',
    );

    return {
      message: 'Campaign status updated successfully',
    };
  }
}
