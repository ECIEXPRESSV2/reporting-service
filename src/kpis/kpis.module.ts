import { Module } from '@nestjs/common';
import { AzureMonitorModule } from '../monitoring/azure-monitor.module';
import { KpisController } from './kpis.controller';
import { KpisService } from './kpis.service';

@Module({
  imports: [AzureMonitorModule],
  controllers: [KpisController],
  providers: [KpisService],
})
export class KpisModule {}
