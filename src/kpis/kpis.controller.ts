import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { KpisService, type OverviewResponse } from './kpis.service';

// Rango temporal: mínimo 1h, máximo 30 días. Acota el costo/latencia de la consulta KQL.
const MIN_HOURS = 1;
const MAX_HOURS = 720;
const DEFAULT_HOURS = 24;

@ApiTags('KPIs')
@UseGuards(RolesGuard)
@Controller('kpis')
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Overview del centro de monitoreo (volumen, error rate, p95, top excepciones)',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: `Ventana en horas (${MIN_HOURS}–${MAX_HOURS}, por defecto ${DEFAULT_HOURS}).`,
  })
  getOverview(@Query('hours') hours?: string): Promise<OverviewResponse> {
    return this.kpis.getOverview(this.clampHours(hours));
  }

  private clampHours(raw?: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_HOURS;
    return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.floor(n)));
  }
}
