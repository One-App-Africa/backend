import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '@/config/database.module';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(KNEX_CONNECTION) private knex: Knex,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.knex('users')
      .where({ id: payload.userId })
      .first();

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException();
    }

    return {
      userId: user.id,
      phoneNumber: user.phone_number,
      firstName: user.first_name,
      lastName: user.last_name,
      kycStatus: user.kyc_status,
    };
  }
}
