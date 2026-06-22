import { Injectable } from '@nestjs/common';
import { LoggerService } from '@/services/logger.service';

@Injectable()
export class OneBotService {
  constructor(private logger: LoggerService) {}

  async handleMessage(messageData: any) {
    this.logger.log('One Bot message received', 'OneBotService');
    return { message: 'Message processed' };
  }
}
