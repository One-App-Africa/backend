import { Module } from '@nestjs/common';
import { OneShareController } from './one-share.controller';
import { OneShareService } from './one-share.service';
import { WalletModule } from '@/modules/wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [OneShareController],
  providers: [OneShareService],
  exports: [OneShareService],
})
export class OneShareModule {}
