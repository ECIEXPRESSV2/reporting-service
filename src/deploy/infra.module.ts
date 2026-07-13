import { Module } from '@nestjs/common';
import { InfraController } from './infra.controller';
import { GithubService } from './github.service';
import { ContainerAppsService } from './container-apps.service';
import { ServiceBusMetricsService } from '../servicebus/servicebus-metrics.service';

/**
 * Infra del centro de monitoreo: estado de deploy (GitHub Actions + revisión de Container Apps)
 * y backlog del Service Bus (Azure Monitor metrics). GitHub funciona en cualquier entorno
 * (repos públicos); Container Apps y Service Bus solo en el desplegado (Azure).
 */
@Module({
  controllers: [InfraController],
  providers: [GithubService, ContainerAppsService, ServiceBusMetricsService],
})
export class InfraModule {}
