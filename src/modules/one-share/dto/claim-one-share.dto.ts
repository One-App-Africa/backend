import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ClaimOneShareDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 8, { message: 'Share code must be 8 characters' })
  shareCode: string;
}
