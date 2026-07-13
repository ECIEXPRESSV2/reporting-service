import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  KpisService,
  type EventFlowResponse,
  type LatencyResponse,
  type OverviewResponse,
} from './kpis.service';

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

  @Get('latency')
  @ApiOperation({
    summary: 'Latencia promedio por minuto y servicio (últimos N minutos, 1–1440; default 10).',
  })
  @ApiQuery({ name: 'minutes', required: false, description: 'Ventana en minutos (1–1440, default 10).' })
  getLatency(@Query('minutes') minutes?: string): Promise<LatencyResponse> {
    return this.kpis.getLatency(this.clampMinutes(minutes));
  }

  @Get('events')
  @ApiOperation({
    summary: 'Flujo de eventos entre microservicios (generados/recibidos/fallidos), últimos N minutos.',
  })
  @ApiQuery({ name: 'minutes', required: false, description: 'Ventana en minutos (1–1440, default 60).' })
  getEvents(@Query('minutes') minutes?: string): Promise<EventFlowResponse> {
    return this.kpis.getEventFlow(this.clampMinutes(minutes, 60));
  }

  private clampHours(raw?: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_HOURS;
    return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.floor(n)));
  }

  private clampMinutes(raw?: string, fallback = 10): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1440, Math.max(1, Math.floor(n)));
  }
}
