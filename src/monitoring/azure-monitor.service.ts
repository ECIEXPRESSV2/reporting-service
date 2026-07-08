import { Injectable, Logger } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import {
  LogsQueryClient,
  LogsQueryResultStatus,
  type LogsTable,
} from '@azure/monitor-query-logs';

export type KqlRow = Record<string, unknown>;

/**
 * Envuelve el SDK de Azure Monitor Query para correr KQL contra la telemetría de
 * Application Insights, que al ser workspace-based vive en el Log Analytics workspace
 * (tablas de esquema workspace: AppRequests, AppDependencies, AppExceptions, AppTraces,
 * AppEvents, AppMetrics; el rol del servicio es AppRoleName).
 *
 * Autenticación passwordless: DefaultAzureCredential toma la Managed Identity de
 * usuario compartida (AZURE_CLIENT_ID la fuerza a esa MID). En Azure necesita el rol
 * "Log Analytics Reader" sobre el workspace (ver Terraform
 * azurerm_role_assignment.log_analytics_reader).
 *
 * Se consulta el WORKSPACE por su GUID (customerId, LOG_ANALYTICS_WORKSPACE_ID) con
 * queryWorkspace. Antes se intentó queryResource contra el componente App Insights,
 * pero la MID recibía 403: el data action de query resuelve contra el workspace, así
 * que el rol y la consulta deben ser a nivel de workspace.
 *
 * Si LOG_ANALYTICS_WORKSPACE_ID no está presente (local/tests), queda deshabilitado
 * y devuelve [] en vez de romper el arranque, igual que setupAppInsights().
 */
@Injectable()
export class AzureMonitorService {
  private readonly logger = new Logger(AzureMonitorService.name);
  private readonly workspaceId = process.env.LOG_ANALYTICS_WORKSPACE_ID;
  private client?: LogsQueryClient;

  get enabled(): boolean {
    return Boolean(this.workspaceId);
  }

  private getClient(): LogsQueryClient {
    if (!this.client) {
      this.client = new LogsQueryClient(new DefaultAzureCredential());
    }
    return this.client;
  }

  /**
   * Ejecuta una consulta KQL sobre las últimas `hours` horas y devuelve las filas de
   * la primera tabla como objetos { columna: valor }.
   *
   * El rango se aplica vía el timespan del SDK (no hace falta `where timestamp > ago()`
   * en el KQL). Lanza si la consulta falla; el llamador decide si tolerarlo.
   */
  async query(kql: string, hours = 24): Promise<KqlRow[]> {
    if (!this.workspaceId) {
      this.logger.warn(
        'LOG_ANALYTICS_WORKSPACE_ID no configurado; devolviendo [] (KQL deshabilitado en local).',
      );
      return [];
    }

    const result = await this.getClient().queryWorkspace(this.workspaceId, kql, {
      duration: `PT${hours}H`,
    });

    if (result.status !== LogsQueryResultStatus.Success) {
      const partial = result.partialError?.message ?? 'motivo desconocido';
      throw new Error(`Consulta KQL fallida (${result.status}): ${partial}`);
    }

    const table = result.tables[0];
    if (!table) return [];
    return this.tableToRows(table);
  }

  private tableToRows(table: LogsTable): KqlRow[] {
    const columns = table.columnDescriptors.map((c) => c.name ?? '');
    return table.rows.map((row) => {
      const obj: KqlRow = {};
      columns.forEach((name, i) => {
        obj[name] = row[i];
      });
      return obj;
    });
  }
}
