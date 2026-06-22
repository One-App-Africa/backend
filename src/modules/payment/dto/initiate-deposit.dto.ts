import { IsNumber, IsEmail, Min } from 'class-validator';

export class InitiateDepositDto {
  @IsNumber()
  @Min(100, { message: 'Minimum deposit amount is NGN 100' })
  amount: number;

  @IsEmail()
  email: string;
}
