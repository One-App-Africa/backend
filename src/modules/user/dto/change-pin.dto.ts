import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class ChangePinDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'Old PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'Old PIN must contain only numbers' })
  oldPin: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'New PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'New PIN must contain only numbers' })
  newPin: string;
}
