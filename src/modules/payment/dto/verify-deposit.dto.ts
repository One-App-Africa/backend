import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyDepositDto {
  @IsString()
  @IsNotEmpty()
  reference: string;
}
