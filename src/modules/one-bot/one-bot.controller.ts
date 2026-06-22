import { Controller, Post, Body } from '@nestjs/common';
import { OneBotService } from './one-bot.service';

@Controller('one-bot')
export class OneBotController {
  constructor(private oneBotService: OneBotService) {}

  @Post('message')
  async handleMessage(@Body() messageData: any) {
    return this.oneBotService.handleMessage(messageData);
  }
}
