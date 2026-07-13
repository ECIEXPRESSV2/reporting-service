import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { BusinessDbService } from './business-db.service';
import { QuickQueriesService } from './quick-queries.service';
import { ServicesHealthService } from '../health/services-health.service';

/**
 * Centro de monitoreo — parte de negocio: salud de microservicios (ping a /health) y
 * consultas rápidas (catálogo allowlisted sobre las BD de orders/financial, solo lectura).
 */
@Module({
  controllers: [MonitoringController],
  providers: [BusinessDbService, QuickQueriesService, ServicesHealthService],
})
export class BusinessModule {}
