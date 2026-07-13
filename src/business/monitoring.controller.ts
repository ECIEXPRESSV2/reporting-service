import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { ServicesHealthService, type ServiceHealth } from '../health/services-health.service';
import { QuickQueriesService, type QuickQueryResult } from './quick-queries.service';

@ApiTags('Monitoring')
@UseGuards(RolesGuard)
@Controller('kpis')
export class MonitoringController {
  constructor(
    private readonly health: ServicesHealthService,
    private readonly quick: QuickQueriesService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Estado (activo/caído) + tiempo de respuesta de cada microservicio.' })
  getHealth(): Promise<ServiceHealth[]> {
    return this.health.checkAll();
  }

  @Get('quick')
  @ApiOperation({ summary: 'Catálogo de consultas rápidas disponibles (con sus parámetros).' })
  listQuick() {
    return this.quick.list();
  }

  @Get('quick/:key')
  @ApiOperation({ summary: 'Ejecuta una consulta rápida del catálogo con sus parámetros.' })
  runQuick(
    @Param('key') key: string,
    @Query() query: Record<string, string>,
  ): Promise<QuickQueryResult> {
    return this.quick.run(key, query);
  }
}
