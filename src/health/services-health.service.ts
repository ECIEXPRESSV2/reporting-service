import { Injectable } from '@nestjs/common';

interface ServiceTarget {
  key: string;
  label: string;
  url?: string;
}

export interface ServiceHealth {
  service: string;
  label: string;
  up: boolean;
  /** Tiempo de respuesta del ping a /health, en ms (proxy del tiempo de respuesta del servicio). */
  responseMs: number | null;
  statusCode?: number;
  checkedAt: string;
}

const HEALTH_TIMEOUT_MS = 4000;

/**
 * Chequea la salud de cada microservicio pegando a su `/health` (URLs internas). Devuelve
 * estado (activo/caído) y el tiempo de respuesta del ping. El dashboard hace polling cada 5s.
 */
@Injectable()
export class ServicesHealthService {
  private targets(): ServiceTarget[] {
    return [
      { key: 'gateway', label: 'API Gateway', url: process.env.SERVICE_GATEWAY_URL },
      { key: 'identity', label: 'Identity', url: process.env.SERVICE_IDENTITY_URL },
      { key: 'products', label: 'Products', url: process.env.SERVICE_PRODUCTS_URL },
      { key: 'orders', label: 'Orders', url: process.env.SERVICE_ORDERS_URL },
      { key: 'financial', label: 'Financial', url: process.env.SERVICE_FINANCIAL_URL },
      { key: 'fulfillment', label: 'Fulfillment', url: process.env.SERVICE_FULFILLMENT_URL },
      { key: 'notifications', label: 'Notifications', url: process.env.SERVICE_NOTIFICATIONS_URL },
    ].filter((t) => t.url);
  }

  async checkAll(): Promise<ServiceHealth[]> {
    return Promise.all(this.targets().map((t) => this.checkOne(t)));
  }

  private async checkOne(target: ServiceTarget): Promise<ServiceHealth> {
    const base = (target.url ?? '').replace(/\/$/, '');
    const start = Date.now();
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return {
        service: target.key,
        label: target.label,
        up: res.ok,
        responseMs: Date.now() - start,
        statusCode: res.status,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        service: target.key,
        label: target.label,
        up: false,
        responseMs: null,
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
