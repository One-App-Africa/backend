import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class SetPinDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must contain only numbers' })
  pin: string;
}
