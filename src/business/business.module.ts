import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { BusinessDbService } from './business-db.service';
import { QuickQueriesService } from './quick-queries.service';
import { ServiceLogsService } from './service-logs.service';
import { ServicesHealthService } from '../health/services-health.service';
import { AzureMonitorModule } from '../monitoring/azure-monitor.module';

/**
 * Centro de monitoreo — parte de negocio: salud de microservicios (ping a /health),
 * consultas rápidas (catálogo allowlisted sobre las BD de orders/financial, solo lectura)
 * y logs "en vivo" por consola (KQL sobre Log Analytics).
 */
@Module({
  imports: [AzureMonitorModule],
  controllers: [MonitoringController],
  providers: [BusinessDbService, QuickQueriesService, ServicesHealthService, ServiceLogsService],
})
export class BusinessModule {}
