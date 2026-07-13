import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessDbService } from './business-db.service';
import { QUICK_QUERIES, type QuickParam, type QuickQuery } from './quick-queries.catalog';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface QuickQueryResult {
  key: string;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class QuickQueriesService {
  constructor(private readonly db: BusinessDbService) {}

  /** Catálogo (sin el SQL) para que el dashboard arme los selectores/formularios solo. */
  list() {
    return QUICK_QUERIES.map((q) => ({
      key: q.key,
      label: q.label,
      description: q.description,
      db: q.db,
      available: this.db.isEnabled(q.db),
      params: q.params.map(({ name, type, required, label, default: def, widget }) => ({
        name,
        type,
        required,
        label,
        default: def ?? null,
        widget: widget ?? null,
      })),
    }));
  }

  async run(
    key: string,
    raw: Record<string, string | undefined>,
  ): Promise<QuickQueryResult> {
    const query = QUICK_QUERIES.find((q) => q.key === key);
    if (!query) throw new NotFoundException(`La consulta '${key}' no existe.`);

    const params = query.params.map((p) => this.coerce(query, p, raw[p.name]));
    const rows = await this.db.query(query.db, query.sql, params);
    return {
      key: query.key,
      label: query.label,
      columns: rows[0] ? Object.keys(rows[0]) : [],
      rows,
    };
  }

  /** Valida y convierte un parámetro según su tipo declarado. Devuelve null si es opcional y falta. */
  private coerce(query: QuickQuery, param: QuickParam, raw?: string): unknown {
    const value = raw ?? (param.default !== undefined ? String(param.default) : undefined);
    if (value === undefined || value === '') {
      if (param.required) {
        throw new BadRequestException(`Falta el parámetro requerido '${param.name}'.`);
      }
      return null;
    }
    switch (param.type) {
      case 'uuid':
        if (!UUID_RE.test(value)) {
          throw new BadRequestException(`'${param.name}' debe ser un UUID válido.`);
        }
        return value;
      case 'int':
      case 'bigint': {
        const n = Number(value);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          throw new BadRequestException(`'${param.name}' debe ser un entero.`);
        }
        return param.type === 'bigint' ? String(Math.trunc(n)) : Math.trunc(n);
      }
    }
  }
}
