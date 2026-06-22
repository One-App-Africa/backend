import { Module } from '@nestjs/common';
import { OneShareController } from './one-share.controller';
import { OneShareService } from './one-share.service';

@Module({
  controllers: [OneShareController],
  providers: [OneShareService],
  exports: [OneShareService],
})
export class OneShareModule {}
