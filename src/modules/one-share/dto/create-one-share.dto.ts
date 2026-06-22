import { IsNumber, IsString, IsOptional, Min, Max, IsIn } from 'class-validator';

export class CreateOneShareDto {
  @IsNumber()
  @Min(1)
  @Max(1000000)
  amount: number;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsIn(['main', 'promo'])
  fromWallet: 'main' | 'promo';
}
