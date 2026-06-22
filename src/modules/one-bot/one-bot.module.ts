import { Module } from '@nestjs/common';
import { OneBotController } from './one-bot.controller';
import { OneBotService } from './one-bot.service';

@Module({
  controllers: [OneBotController],
  providers: [OneBotService],
  exports: [OneBotService],
})
export class OneBotModule {}
