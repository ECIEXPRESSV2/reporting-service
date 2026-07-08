import { Module } from '@nestjs/common';
import { AzureMonitorService } from './azure-monitor.service';

/**
 * Expone AzureMonitorService (cliente KQL de Application Insights) al resto de la app.
 * Global: cualquier módulo de KPIs/salud/logs lo inyecta sin re-importarlo.
 */
@Module({
  providers: [AzureMonitorService],
  exports: [AzureMonitorService],
})
export class AzureMonitorModule {}
