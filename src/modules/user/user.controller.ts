import { Controller, Get, Put, Body, Req, UseGuards, Param } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    return this.userService.getProfile((req as any).user.userId);
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() updateProfileDto: UpdateProfileDto) {
    return this.userService.updateProfile((req as any).user.userId, updateProfileDto);
  }

  @Get('referrals')
  async getReferrals(@Req() req: Request) {
    return this.userService.getReferrals((req as any).user.userId);
  }

  @Get('referral-stats')
  async getReferralStats(@Req() req: Request) {
    return this.userService.getReferralStats((req as any).user.userId);
  }

  @Put('pin/set')
  async setPin(@Req() req: Request, @Body() setPinDto: SetPinDto) {
    return this.userService.setPin((req as any).user.userId, setPinDto);
  }

  @Put('pin/change')
  async changePin(@Req() req: Request, @Body() changePinDto: ChangePinDto) {
    return this.userService.changePin((req as any).user.userId, changePinDto);
  }
}
