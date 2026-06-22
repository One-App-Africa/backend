import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { KNEX_CONNECTION } from '@/config/database.module';
import { REDIS_CLIENT } from '@/config/redis.module';
import { LoggerService } from '@/services/logger.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private jwtService: JwtService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { phoneNumber, password, firstName, lastName, referralCode } = registerDto;

    // Check if user already exists
    const existingUser = await this.knex('users')
      .where({ phone_number: phoneNumber })
      .first();

    if (existingUser) {
      throw new BadRequestException('Phone number already registered');
    }

    // Validate referral code if provided
    let referrerId = null;
    if (referralCode) {
      const referrer = await this.knex('users')
        .where({ referral_code: referralCode })
        .first();

      if (!referrer) {
        throw new BadRequestException('Invalid referral code');
      }
      referrerId = referrer.id;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = this.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const userId = uuidv4();
    const userReferralCode = this.generateReferralCode();

    await this.knex('users').insert({
      id: userId,
      phone_number: phoneNumber,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      referral_code: userReferralCode,
      referred_by: referrerId,
      otp_code: otp,
      otp_expiry: otpExpiry,
      is_phone_verified: false,
      status: 'pending_verification',
    });

    // Store OTP in Redis for rate limiting
    await this.redis.setex(`otp:${phoneNumber}`, 600, otp);

    // Send OTP via SMS (implement later)
    this.logger.log(`OTP for ${phoneNumber}: ${otp}`, 'AuthService');

    return {
      message: 'Registration successful. Please verify your phone number.',
      userId,
      phoneNumber,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phoneNumber, otp } = verifyOtpDto;

    const user = await this.knex('users')
      .where({ phone_number: phoneNumber })
      .first();

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.is_phone_verified) {
      throw new BadRequestException('Phone number already verified');
    }

    if (user.otp_code !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    if (new Date() > new Date(user.otp_expiry)) {
      throw new BadRequestException('OTP expired');
    }

    // Update user as verified
    await this.knex('users')
      .where({ id: user.id })
      .update({
        is_phone_verified: true,
        status: 'active',
        otp_code: null,
        otp_expiry: null,
        verified_at: this.knex.fn.now(),
      });

    // Create wallets for the user
    await this.createUserWallets(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(user.id);

    return {
      message: 'Phone number verified successfully',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { phoneNumber } = resendOtpDto;

    // Check rate limiting
    const lastOtp = await this.redis.get(`otp:${phoneNumber}`);
    if (lastOtp) {
      throw new BadRequestException('Please wait before requesting a new OTP');
    }

    const user = await this.knex('users')
      .where({ phone_number: phoneNumber })
      .first();

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.is_phone_verified) {
      throw new BadRequestException('Phone number already verified');
    }

    // Generate new OTP
    const otp = this.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await this.knex('users')
      .where({ id: user.id })
      .update({
        otp_code: otp,
        otp_expiry: otpExpiry,
      });

    await this.redis.setex(`otp:${phoneNumber}`, 600, otp);

    this.logger.log(`New OTP for ${phoneNumber}: ${otp}`, 'AuthService');

    return {
      message: 'OTP resent successfully',
    };
  }

  async validateUser(phoneNumber: string, password: string) {
    const user = await this.knex('users')
      .where({ phone_number: phoneNumber })
      .first();

    if (!user) {
      return null;
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account not active');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(user: any) {
    const tokens = await this.generateTokens(user.id);

    return {
      message: 'Login successful',
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.knex('users')
        .where({ id: payload.userId })
        .first();

      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(user.id);

      return {
        message: 'Token refreshed successfully',
        ...tokens,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    // Invalidate tokens in Redis
    await this.redis.del(`refresh_token:${userId}`);

    return {
      message: 'Logout successful',
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { phoneNumber } = forgotPasswordDto;

    const user = await this.knex('users')
      .where({ phone_number: phoneNumber })
      .first();

    if (!user) {
      // Don't reveal if user exists
      return {
        message: 'If the phone number exists, a reset code has been sent',
      };
    }

    const resetCode = this.generateOtp();
    const resetExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await this.knex('users')
      .where({ id: user.id })
      .update({
        otp_code: resetCode,
        otp_expiry: resetExpiry,
      });

    this.logger.log(`Password reset code for ${phoneNumber}: ${resetCode}`, 'AuthService');

    return {
      message: 'If the phone number exists, a reset code has been sent',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { phoneNumber, otp, newPassword } = resetPasswordDto;

    const user = await this.knex('users')
      .where({ phone_number: phoneNumber })
      .first();

    if (!user || user.otp_code !== otp) {
      throw new BadRequestException('Invalid reset code');
    }

    if (new Date() > new Date(user.otp_expiry)) {
      throw new BadRequestException('Reset code expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.knex('users')
      .where({ id: user.id })
      .update({
        password_hash: passwordHash,
        otp_code: null,
        otp_expiry: null,
      });

    return {
      message: 'Password reset successful',
    };
  }

  private async generateTokens(userId: string) {
    const accessToken = this.jwtService.sign(
      { userId },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRY') || '1h',
      },
    );

    const refreshToken = this.jwtService.sign(
      { userId },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRY') || '7d',
      },
    );

    // Store refresh token in Redis
    await this.redis.setex(
      `refresh_token:${userId}`,
      7 * 24 * 60 * 60,
      refreshToken,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get('JWT_EXPIRY') || '1h',
    };
  }

  private async createUserWallets(userId: string) {
    const walletTypes = ['main', 'promo'];

    for (const type of walletTypes) {
      await this.knex('wallets').insert({
        id: uuidv4(),
        user_id: userId,
        wallet_type: type,
        balance: 0,
        currency: 'NGN',
      });
    }
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  private sanitizeUser(user: any) {
    const { password_hash, otp_code, otp_expiry, ...sanitized } = user;
    return sanitized;
  }
}
