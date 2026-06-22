import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getRoot() {
    return {
      name: 'One App API',
      version: '1.0.0',
      description: "Africa's Value Distribution Network",
      environment: this.configService.get('NODE_ENV'),
      documentation: '/api/v1/docs',
    };
  }

  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get('NODE_ENV'),
    };
  }
}
