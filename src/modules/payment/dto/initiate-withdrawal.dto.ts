import { IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';

export class InitiateWithdrawalDto {
  @IsNumber()
  @Min(1000, { message: 'Minimum withdrawal amount is NGN 1,000' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;
}
