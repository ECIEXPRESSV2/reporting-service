import { Injectable, Logger } from '@nestjs/common';
import {
  AzureMonitorService,
  type KqlRow,
} from '../monitoring/azure-monitor.service';
import {
  LATENCY_TIMESERIES,
  OVERVIEW_BY_SERVICE,
  OVERVIEW_TOP_EXCEPTIONS,
  OVERVIEW_TOTALS,
} from './queries/overview.queries';
import {
  EVENTS_FAILED,
  EVENTS_PUBLISHED,
  EVENTS_RECEIVED,
} from './queries/events.queries';

export interface LatencyPoint {
  timestamp: string;
  service: string;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  requests: number;
}

export interface LatencyResponse {
  minutes: number;
  generatedAt: string;
  /** false en local/tests (sin App Insights): points viene vacío. */
  enabled: boolean;
  points: LatencyPoint[];
}

export interface EventFlowResponse {
  minutes: number;
  generatedAt: string;
  enabled: boolean;
  /** Eventos generados/recibidos: [{ service, routingKey, eventos }]. Fallidos: [{ service, tipo, fallos, muestra }]. */
  published: KqlRow[];
  received: KqlRow[];
  failed: KqlRow[];
}

export interface OverviewTotals {
  totalRequests: number;
  failedRequests: number;
  errorRatePct: number;
  p50Ms: number;
  p95Ms: number;
}

export interface OverviewResponse {
  rangeHours: number;
  generatedAt: string;
  /** false en local/tests (sin APPLICATIONINSIGHTS_RESOURCE_ID): las secciones vienen vacías. */
  enabled: boolean;
  /** null si la consulta de totales falló (el resto del dashboard sigue vivo). */
  totals: OverviewTotals | null;
  services: KqlRow[] | null;
  topExceptions: KqlRow[] | null;
}

/**
 * Arma el overview del centro de monitoreo corriendo el catálogo KQL en paralelo.
 *
 * Resiliencia: usa allSettled para que un fallo aislado (p. ej. la tabla exceptions
 * vacía o un timeout) no tumbe todo el dashboard; la sección afectada llega como null
 * y el front la degrada con elegancia.
 */
@Injectable()
export class KpisService {
  private readonly logger = new Logger(KpisService.name);

  constructor(private readonly monitor: AzureMonitorService) {}

  async getOverview(hours: number): Promise<OverviewResponse> {
    const [totalsRes, servicesRes, exceptionsRes] = await Promise.allSettled([
      this.monitor.query(OVERVIEW_TOTALS, hours),
      this.monitor.query(OVERVIEW_BY_SERVICE, hours),
      this.monitor.query(OVERVIEW_TOP_EXCEPTIONS, hours),
    ]);

    return {
      rangeHours: hours,
      generatedAt: new Date().toISOString(),
      enabled: this.monitor.enabled,
      totals: this.shapeTotals(this.unwrap(totalsRes, 'totals')),
      services: this.unwrap(servicesRes, 'services'),
      topExceptions: this.unwrap(exceptionsRes, 'topExceptions'),
    };
  }

  /**
   * Serie de latencia promedio por minuto y servicio en los últimos `minutes`. La consumen
   * las tarjetas de salud (valor del minuto más reciente por servicio) y la gráfica del popup.
   */
  async getLatency(minutes: number): Promise<LatencyResponse> {
    let points: LatencyPoint[] = [];
    try {
      const rows = await this.monitor.queryMinutes(LATENCY_TIMESERIES, minutes);
      points = rows.map((r) => ({
        timestamp: String(r.timestamp ?? ''),
        service: String(r.service ?? ''),
        avgMs: this.num(r.avgMs),
        p95Ms: this.num(r.p95Ms),
        p99Ms: this.num(r.p99Ms),
        requests: this.num(r.requests),
      }));
    } catch (e) {
      this.logger.error(`Latencia falló: ${(e as Error).message}`);
    }
    return {
      minutes,
      generatedAt: new Date().toISOString(),
      enabled: this.monitor.enabled,
      points,
    };
  }

  /** Flujo de eventos entre microservicios (generados/recibidos/fallidos) desde App Insights. */
  async getEventFlow(minutes: number): Promise<EventFlowResponse> {
    const [pub, rec, fail] = await Promise.allSettled([
      this.monitor.queryMinutes(EVENTS_PUBLISHED, minutes),
      this.monitor.queryMinutes(EVENTS_RECEIVED, minutes),
      this.monitor.queryMinutes(EVENTS_FAILED, minutes),
    ]);
    const safe = (r: PromiseSettledResult<KqlRow[]>) =>
      r.status === 'fulfilled' ? r.value : [];
    return {
      minutes,
      generatedAt: new Date().toISOString(),
      enabled: this.monitor.enabled,
      published: safe(pub),
      received: safe(rec),
      failed: safe(fail),
    };
  }

  private unwrap(
    res: PromiseSettledResult<KqlRow[]>,
    section: string,
  ): KqlRow[] | null {
    if (res.status === 'fulfilled') return res.value;
    this.logger.error(`KPI '${section}' falló: ${res.reason}`);
    return null;
  }

  private shapeTotals(rows: KqlRow[] | null): OverviewTotals | null {
    if (!rows) return null;
    const r = rows[0] ?? {};
    const totalRequests = this.num(r.totalRequests);
    const failedRequests = this.num(r.failedRequests);
    return {
      totalRequests,
      failedRequests,
      errorRatePct:
        totalRequests === 0
          ? 0
          : Math.round((10000 * failedRequests) / totalRequests) / 100,
      p50Ms: this.num(r.p50Ms),
      p95Ms: this.num(r.p95Ms),
    };
  }

  private num(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
}
