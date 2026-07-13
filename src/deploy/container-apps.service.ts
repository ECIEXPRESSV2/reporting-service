import { Injectable, Logger } from '@nestjs/common';
import { ContainerAppsAPIClient } from '@azure/arm-appcontainers';
import { DefaultAzureCredential } from '@azure/identity';

export interface RevisionInfo {
  available: boolean;
  app?: string;
  latestRevision?: string;
  activeRevision?: string;
  replicas?: number;
  runningState?: string;
  createdTime?: string;
  note?: string;
}

/**
 * Revisión ACTIVA de un microservicio en Container Apps (para saber si un deploy generó una
 * revisión nueva). Solo funciona en el entorno desplegado: usa la Managed Identity y requiere
 * `AZURE_SUBSCRIPTION_ID` + `AZURE_RESOURCE_GROUP`. En local degrada a { available:false }.
 */
@Injectable()
export class ContainerAppsService {
  private readonly logger = new Logger(ContainerAppsService.name);
  private client?: ContainerAppsAPIClient;

  private get enabled(): boolean {
    return Boolean(process.env.AZURE_SUBSCRIPTION_ID && process.env.AZURE_RESOURCE_GROUP);
  }

  private getClient(): ContainerAppsAPIClient {
    if (!this.client) {
      this.client = new ContainerAppsAPIClient(
        new DefaultAzureCredential(),
        process.env.AZURE_SUBSCRIPTION_ID as string,
      );
    }
    return this.client;
  }

  async getRevision(service: string): Promise<RevisionInfo> {
    if (!this.enabled) {
      return { available: false, note: 'Solo en el entorno desplegado (Azure).' };
    }
    const rg = process.env.AZURE_RESOURCE_GROUP as string;
    const app = `${process.env.CONTAINERAPP_PREFIX ?? 'eciexpress-prod'}-${service}`;
    try {
      const client = this.getClient();
      const info = await client.containerApps.get(rg, app);
      let active: { name?: string; replicas?: number; runningState?: string; createdTime?: Date } | undefined;
      for await (const rev of client.containerAppsRevisions.listRevisions(rg, app)) {
        if (rev.active) {
          active = rev;
          break;
        }
      }
      return {
        available: true,
        app,
        latestRevision: info.latestRevisionName,
        activeRevision: active?.name,
        replicas: active?.replicas,
        runningState: active?.runningState,
        createdTime:
          active?.createdTime instanceof Date
            ? active.createdTime.toISOString()
            : (active?.createdTime as string | undefined),
      };
    } catch (e) {
      this.logger.warn(`Revisión de ${app} falló: ${(e as Error).message}`);
      return { available: false, app, note: (e as Error).message };
    }
  }
}
