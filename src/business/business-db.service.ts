import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool } from 'pg';

export type BusinessDb = 'orders' | 'financial';

/**
 * Acceso de SOLO LECTURA a las bases de negocio (orders, financial) para las consultas
 * rápidas del centro de monitoreo. reporting no tiene BD propia; consulta las de esos
 * servicios con pools separados. Las consultas viven en un catálogo allowlisted
 * (`quick-queries.catalog.ts`) — NUNCA se interpola entrada del usuario en el SQL; los
 * parámetros van SIEMPRE como bind ($1, $2…). `statement_timeout` acota el costo.
 */
@Injectable()
export class BusinessDbService implements OnModuleDestroy {
  private readonly logger = new Logger(BusinessDbService.name);
  private readonly pools = new Map<BusinessDb, Pool>();

  private urlFor(db: BusinessDb): string | undefined {
    return db === 'orders'
      ? process.env.ORDERS_DATABASE_URL
      : process.env.FINANCIAL_DATABASE_URL;
  }

  isEnabled(db: BusinessDb): boolean {
    return Boolean(this.urlFor(db));
  }

  private pool(db: BusinessDb): Pool {
    let pool = this.pools.get(db);
    if (!pool) {
      const url = this.urlFor(db);
      if (!url) {
        throw new ServiceUnavailableException(
          `Consultas de negocio deshabilitadas: falta ${db === 'orders' ? 'ORDERS_DATABASE_URL' : 'FINANCIAL_DATABASE_URL'}.`,
        );
      }
      pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        max: 3,
        statement_timeout: 8000,
        idleTimeoutMillis: 30000,
      });
      pool.on('error', (e) =>
        this.logger.error(`Pool ${db} error: ${e.message}`),
      );
      this.pools.set(db, pool);
    }
    return pool;
  }

  async query<T = Record<string, unknown>>(
    db: BusinessDb,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    try {
      const res = await this.pool(db).query(sql, params);
      return res.rows as T[];
    } catch (e) {
      this.logger.error(`Consulta a ${db} falló: ${(e as Error).message}`);
      throw new ServiceUnavailableException(
        'No se pudo ejecutar la consulta de negocio.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.end().catch(() => undefined);
    }
  }
}
