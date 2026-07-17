import { BadRequestException, Injectable } from '@nestjs/common';
import { AzureMonitorService } from '../monitoring/azure-monitor.service';

const KNOWN_SERVICES = new Set([
  'gateway',
  'identity',
  'products',
  'orders',
  'financial',
  'fulfillment',
  'notifications',
  'reporting',
]);

export type ServiceLogSource = 'app' | 'waf' | 'access';

export interface ServiceLogLine {
  timestamp: string;
  source: ServiceLogSource;
  /** stdout/stderr (solo `source: 'app'`). */
  stream?: string;
  text: string;
  /** Campos propios del WAF, para que el frontend los pueda resaltar aparte del texto. */
  clientIp?: string;
  ruleId?: string;
  ruleGroup?: string;
  action?: string;
  requestUri?: string;
}

export interface ServiceLogsResult {
  service: string;
  enabled: boolean;
  lines: ServiceLogLine[];
}

const DEFAULT_LOOKBACK_MINUTES = 15;
const MAX_LOOKBACK_MINUTES = 180;

/**
 * Logs "en vivo" de un microservicio, para el botón de consola del centro de monitoreo
 * (prevención: poder ver en la propia app qué está pasando, sin ir al portal de Azure).
 *
 * Fuente: Container Apps ya manda stdout/stderr de TODOS los apps a la tabla
 * `ContainerAppConsoleLogs_CL` del mismo Log Analytics workspace que usa AzureMonitorService
 * para KQL (el environment se creó con `log_analytics_workspace_id`, ver Terraform
 * layer3_compute.tf) -- no hace falta ninguna config nueva para esa parte.
 *
 * Para `gateway` en particular, se agregan TAMBIÉN los logs del Application Gateway
 * (`ApplicationGatewayFirewallLog` + `ApplicationGatewayAccessLog`, tabla `AzureDiagnostics`,
 * diagnostic setting de layer4_ingress.tf) con `source: 'waf'/'access'` como diferenciador,
 * para poder ver qué IP se está bloqueando y por qué regla del WAF.
 *
 * El frontend hace polling (no hay push real): primera carga trae los últimos `minutes`,
 * y las siguientes piden `since` = timestamp de la última línea vista, para solo traer líneas
 * nuevas y no repetir el historial ya mostrado.
 */
@Injectable()
export class ServiceLogsService {
  constructor(private readonly monitor: AzureMonitorService) {}

  async getLogs(service: string, opts: { minutes?: number; since?: string }): Promise<ServiceLogsResult> {
    if (!KNOWN_SERVICES.has(service)) {
      throw new BadRequestException(`Servicio desconocido: ${service}`);
    }
    if (!this.monitor.enabled) {
      return { service, enabled: false, lines: [] };
    }

    const since = opts.since ? new Date(opts.since) : null;
    if (since && Number.isNaN(since.getTime())) {
      throw new BadRequestException('since debe ser una fecha ISO válida');
    }
    const lookbackMinutes = since
      ? Math.min(MAX_LOOKBACK_MINUTES, Math.max(1, Math.ceil((Date.now() - since.getTime()) / 60_000) + 1))
      : Math.min(MAX_LOOKBACK_MINUTES, Math.max(1, opts.minutes ?? DEFAULT_LOOKBACK_MINUTES));

    const [appLines, gatewayLines] = await Promise.all([
      this.getContainerLogs(service, lookbackMinutes),
      service === 'gateway' ? this.getAppGatewayLogs(lookbackMinutes) : Promise.resolve([]),
    ]);

    const all = [...appLines, ...gatewayLines]
      .filter((line) => !since || new Date(line.timestamp).getTime() > since.getTime())
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { service, enabled: true, lines: all };
  }

  private async getContainerLogs(service: string, minutes: number): Promise<ServiceLogLine[]> {
    const prefix = process.env.CONTAINERAPP_PREFIX ?? 'eciexpress-prod';
    const appName = `${prefix}-${service}`;
    const kql = `
      ContainerAppConsoleLogs_CL
      | where ContainerAppName_s == '${appName}'
      | project TimeGenerated, Log_s, Stream_s
      | order by TimeGenerated asc
    `;
    const rows = await this.monitor.queryMinutes(kql, minutes);
    return rows.map((r) => ({
      timestamp: new Date(r['TimeGenerated'] as string).toISOString(),
      source: 'app' as const,
      stream: (r['Stream_s'] as string) || undefined,
      text: (r['Log_s'] as string) ?? '',
    }));
  }

  /** Logs del Application Gateway (WAF + acceso), solo para la consola del gateway. */
  private async getAppGatewayLogs(minutes: number): Promise<ServiceLogLine[]> {
    const kql = `
      AzureDiagnostics
      | where Category in ('ApplicationGatewayFirewallLog', 'ApplicationGatewayAccessLog')
      | project TimeGenerated, Category, clientIp_s, requestUri_s, httpMethod_s, httpStatus_d,
                 action_s, ruleId_s, ruleGroup_s, Message, details_message_s
      | order by TimeGenerated asc
    `;
    const rows = await this.monitor.queryMinutes(kql, minutes);
    return rows.map((r) => {
      const isFirewall = r['Category'] === 'ApplicationGatewayFirewallLog';
      const clientIp = (r['clientIp_s'] as string) || undefined;
      const requestUri = (r['requestUri_s'] as string) || undefined;
      const action = (r['action_s'] as string) || undefined;
      const ruleId = (r['ruleId_s'] as string) || undefined;
      const ruleGroup = (r['ruleGroup_s'] as string) || undefined;
      const text = isFirewall
        ? `${action ?? '?'} · regla ${ruleId ?? '-'} (${ruleGroup ?? '-'}) · ip=${clientIp ?? '-'} · ${(r['details_message_s'] as string) || (r['Message'] as string) || ''} · ${requestUri ?? ''}`
        : `${(r['httpMethod_s'] as string) ?? ''} ${requestUri ?? ''} -> ${r['httpStatus_d'] ?? '-'} · ip=${clientIp ?? '-'}`;
      return {
        timestamp: new Date(r['TimeGenerated'] as string).toISOString(),
        source: (isFirewall ? 'waf' : 'access') as ServiceLogSource,
        text,
        clientIp,
        ruleId,
        ruleGroup,
        action,
        requestUri,
      };
    });
  }
}
