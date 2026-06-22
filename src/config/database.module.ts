import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { knex, Knex } from 'knex';

export const KNEX_CONNECTION = 'KNEX_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: KNEX_CONNECTION,
      useFactory: (configService: ConfigService): Knex => {
        return knex({
          client: 'postgresql',
          connection: configService.get('DATABASE_URL'),
          pool: {
            min: configService.get('DB_POOL_MIN') || 2,
            max: configService.get('DB_POOL_MAX') || 10,
          },
          migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
          },
          seeds: {
            directory: './seeds',
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [KNEX_CONNECTION],
})
export class DatabaseModule {}
