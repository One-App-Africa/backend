import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import * as bcrypt from 'bcrypt';
import { KNEX_CONNECTION } from '@/config/database.module';
import { LoggerService } from '@/services/logger.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';

@Injectable()
export class UserService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private logger: LoggerService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.knex('users')
      .where({ id: userId })
      .select(
        'id',
        'phone_number',
        'first_name',
        'last_name',
        'email',
        'bvn',
        'date_of_birth',
        'address',
        'city',
        'state',
        'referral_code',
        'kyc_status',
        'status',
        'is_phone_verified',
        'has_pin',
        'created_at',
      )
      .first();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get wallets
    const wallets = await this.knex('wallets')
      .where({ user_id: userId })
      .select('id', 'wallet_type', 'balance', 'currency');

    // Get referral stats
    const referralCount = await this.knex('users')
      .where({ referred_by: userId })
      .count('id as count')
      .first();

    return {
      user,
      wallets,
      referralCount: parseInt(referralCount?.count as string) || 0,
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { firstName, lastName, email, dateOfBirth, address, city, state } = updateProfileDto;

    const updateData: any = {};
    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (email) updateData.email = email;
    if (dateOfBirth) updateData.date_of_birth = dateOfBirth;
    if (address) updateData.address = address;
    if (city) updateData.city = city;
    if (state) updateData.state = state;

    await this.knex('users')
      .where({ id: userId })
      .update(updateData);

    return {
      message: 'Profile updated successfully',
    };
  }

  async getReferrals(userId: string) {
    const referrals = await this.knex('users')
      .where({ referred_by: userId })
      .select(
        'id',
        'first_name',
        'last_name',
        'phone_number',
        'created_at',
        'kyc_status',
      )
      .orderBy('created_at', 'desc');

    return {
      referrals,
      totalCount: referrals.length,
    };
  }

  async getReferralStats(userId: string) {
    const totalReferrals = await this.knex('users')
      .where({ referred_by: userId })
      .count('id as count')
      .first();

    const kycApprovedReferrals = await this.knex('users')
      .where({ referred_by: userId, kyc_status: 'approved' })
      .count('id as count')
      .first();

    const recentReferrals = await this.knex('users')
      .where({ referred_by: userId })
      .where('created_at', '>=', this.knex.raw("NOW() - INTERVAL '30 days'"))
      .count('id as count')
      .first();

    return {
      totalReferrals: parseInt(totalReferrals?.count as string) || 0,
      kycApprovedReferrals: parseInt(kycApprovedReferrals?.count as string) || 0,
      recentReferrals: parseInt(recentReferrals?.count as string) || 0,
    };
  }

  async setPin(userId: string, setPinDto: SetPinDto) {
    const { pin } = setPinDto;

    const user = await this.knex('users')
      .where({ id: userId })
      .first();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.has_pin) {
      throw new BadRequestException('PIN already set. Use change PIN instead');
    }

    const pinHash = await bcrypt.hash(pin, 10);

    await this.knex('users')
      .where({ id: userId })
      .update({
        pin_hash: pinHash,
        has_pin: true,
        pin_attempts: 0,
      });

    this.logger.log(`PIN set for user ${userId}`, 'UserService');

    return {
      message: 'PIN set successfully',
    };
  }

  async changePin(userId: string, changePinDto: ChangePinDto) {
    const { oldPin, newPin } = changePinDto;

    const user = await this.knex('users')
      .where({ id: userId })
      .first();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.has_pin) {
      throw new BadRequestException('No PIN set. Use set PIN instead');
    }

    const isPinValid = await bcrypt.compare(oldPin, user.pin_hash);
    if (!isPinValid) {
      throw new BadRequestException('Invalid old PIN');
    }

    const pinHash = await bcrypt.hash(newPin, 10);

    await this.knex('users')
      .where({ id: userId })
      .update({
        pin_hash: pinHash,
        pin_attempts: 0,
      });

    this.logger.log(`PIN changed for user ${userId}`, 'UserService');

    return {
      message: 'PIN changed successfully',
    };
  }

  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.knex('users')
      .where({ id: userId })
      .first();

    if (!user || !user.has_pin) {
      throw new BadRequestException('PIN not set');
    }

    if (user.pin_attempts >= 3) {
      throw new BadRequestException('PIN locked. Please reset your PIN');
    }

    const isPinValid = await bcrypt.compare(pin, user.pin_hash);

    if (!isPinValid) {
      await this.knex('users')
        .where({ id: userId })
        .increment('pin_attempts', 1);

      return false;
    }

    await this.knex('users')
      .where({ id: userId })
      .update({ pin_attempts: 0 });

    return true;
  }
}
