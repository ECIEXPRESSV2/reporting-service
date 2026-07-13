import { Injectable, Logger } from '@nestjs/common';
import { MetricsClient } from '@azure/monitor-query-metrics';
import { DefaultAzureCredential } from '@azure/identity';

export interface ServiceBusEntity {
  entity: string;
  active: number;
  deadLettered: number;
}

export interface ServiceBusBacklog {
  available: boolean;
  generatedAt: string;
  entities: ServiceBusEntity[];
  note?: string;
}

/**
 * Backlog del Service Bus (mensajes activos + DEAD-LETTER por entidad/suscripción) vía Azure
 * Monitor **Metrics** (`@azure/monitor-query-metrics`). Los muertos NO están en logs; son una
 * métrica. Solo en desplegado: requiere `SERVICEBUS_RESOURCE_ID` + `AZURE_METRICS_ENDPOINT`
 * (endpoint regional, p. ej. https://eastus2.metrics.monitor.azure.com) y Monitoring Reader
 * de la Managed Identity sobre el namespace. En local degrada a { available:false }.
 */
@Injectable()
export class ServiceBusMetricsService {
  private readonly logger = new Logger(ServiceBusMetricsService.name);
  private client?: MetricsClient;

  private get enabled(): boolean {
    return Boolean(process.env.SERVICEBUS_RESOURCE_ID && process.env.AZURE_METRICS_ENDPOINT);
  }

  private getClient(): MetricsClient {
    if (!this.client) {
      this.client = new MetricsClient(
        process.env.AZURE_METRICS_ENDPOINT as string,
        new DefaultAzureCredential(),
      );
    }
    return this.client;
  }

  async getBacklog(): Promise<ServiceBusBacklog> {
    const now = new Date().toISOString();
    if (!this.enabled) {
      return {
        available: false,
        generatedAt: now,
        entities: [],
        note: 'Solo en el entorno desplegado (Azure Monitor metrics).',
      };
    }
    try {
      const results = await this.getClient().queryResources(
        [process.env.SERVICEBUS_RESOURCE_ID as string],
        ['ActiveMessages', 'DeadletteredMessages'],
        'Microsoft.ServiceBus/namespaces',
        {
          aggregation: 'Average',
          interval: 'PT5M',
          filter: "EntityName eq '*'",
          startTime: new Date(Date.now() - 30 * 60 * 1000),
          endTime: new Date(),
        },
      );

      const byEntity = new Map<string, ServiceBusEntity>();
      for (const result of results) {
        for (const metric of result.metrics ?? []) {
          for (const ts of metric.timeseries ?? []) {
            const entity =
              (ts.metadatavalues ?? []).find((m) => this.dimName(m) === 'EntityName')?.value ??
              'namespace';
            const last = [...(ts.data ?? [])].reverse().find((d) => d.average != null);
            const value = Math.round((last?.average as number | undefined) ?? 0);
            const row = byEntity.get(entity) ?? { entity, active: 0, deadLettered: 0 };
            if (metric.name === 'ActiveMessages') row.active = value;
            if (metric.name === 'DeadletteredMessages') row.deadLettered = value;
            byEntity.set(entity, row);
          }
        }
      }
      return {
        available: true,
        generatedAt: now,
        entities: [...byEntity.values()].sort((a, b) => b.deadLettered - a.deadLettered || b.active - a.active),
      };
    } catch (e) {
      this.logger.warn(`Backlog de Service Bus falló: ${(e as Error).message}`);
      return { available: false, generatedAt: now, entities: [], note: (e as Error).message };
    }
  }

  private dimName(m: { name?: unknown }): string {
    const n = m.name as { value?: string } | string | undefined;
    return typeof n === 'string' ? n : (n?.value ?? '');
  }
}
