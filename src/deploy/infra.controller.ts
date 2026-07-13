import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { GithubService, type GithubDeploy } from './github.service';
import { ContainerAppsService, type RevisionInfo } from './container-apps.service';
import { ServiceBusMetricsService, type ServiceBusBacklog } from '../servicebus/servicebus-metrics.service';

export interface ServiceDeploy {
  service: string;
  github: GithubDeploy;
  revision: RevisionInfo;
}

@ApiTags('Monitoring')
@UseGuards(RolesGuard)
@Controller('kpis')
export class InfraController {
  constructor(
    private readonly github: GithubService,
    private readonly containerApps: ContainerAppsService,
    private readonly serviceBus: ServiceBusMetricsService,
  ) {}

  @Get('deploy/:service')
  @ApiOperation({
    summary: 'Deploy de un microservicio: workflow de GitHub Actions + revisión en Container Apps.',
  })
  async getDeploy(@Param('service') service: string): Promise<ServiceDeploy> {
    const [github, revision] = await Promise.all([
      this.github.getDeploy(service),
      this.containerApps.getRevision(service),
    ]);
    return { service, github, revision };
  }

  @Get('servicebus')
  @ApiOperation({
    summary: 'Backlog del Service Bus: mensajes activos y dead-letter por entidad/suscripción.',
  })
  getServiceBus(): Promise<ServiceBusBacklog> {
    return this.serviceBus.getBacklog();
  }
}
