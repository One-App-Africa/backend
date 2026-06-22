import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class EnrollCampaignDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  campaignId: string;
}
