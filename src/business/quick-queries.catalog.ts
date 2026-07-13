import type { BusinessDb } from './business-db.service';

export type ParamType = 'uuid' | 'int' | 'bigint';

export interface QuickParam {
  name: string;
  type: ParamType;
  required: boolean;
  label: string;
  default?: string | number;
  /** Pista de UI: 'store' => el dashboard muestra el selector de tienda (modal), no un input. */
  widget?: 'store';
}

export interface QuickQuery {
  key: string;
  label: string;
  description: string;
  db: BusinessDb;
  /** Parámetros EN ORDEN: se enlazan como $1, $2… en el SQL. */
  params: QuickParam[];
  sql: string;
}

/**
 * Catálogo ALLOWLISTED de consultas rápidas del centro de monitoreo. Cada entrada es una
 * consulta nombrada + parametrizada. **Para agregar una nueva consulta (p. ej. "días en que
 * más se compra en una tienda") basta con añadir un objeto aquí** — no hace falta un endpoint
 * nuevo ni tocar el frontend (el dashboard lista el catálogo y arma el formulario solo).
 *
 * SEGURIDAD: el SQL es fijo; los valores del usuario van SIEMPRE como bind ($1, $2…), nunca
 * concatenados. Los tipos se validan antes de ejecutar (ver QuickQueriesService).
 */
export const QUICK_QUERIES: QuickQuery[] = [
  {
    key: 'orders-by-store',
    label: 'Pedidos por tienda',
    description: 'Cantidad de pedidos y monto total por tienda.',
    db: 'orders',
    params: [{ name: 'storeId', type: 'uuid', required: false, label: 'Tienda (opcional)', widget: 'store' }],
    sql: `
      SELECT store_id, store_name,
             count(*)::int          AS pedidos,
             coalesce(sum(total_amount), 0)::bigint AS monto_total
      FROM orders
      WHERE deleted_at IS NULL AND status <> 'DRAFT'
        AND ($1::uuid IS NULL OR store_id = $1)
      GROUP BY store_id, store_name
      ORDER BY pedidos DESC`,
  },
  {
    key: 'top-product-by-store',
    label: 'Producto más vendido por tienda',
    description: 'El producto con más unidades vendidas en cada tienda.',
    db: 'orders',
    params: [{ name: 'storeId', type: 'uuid', required: false, label: 'Tienda (opcional)', widget: 'store' }],
    sql: `
      SELECT store_id, store_name, producto, unidades FROM (
        SELECT o.store_id, o.store_name, oi.name AS producto,
               sum(oi.quantity)::int AS unidades,
               row_number() OVER (PARTITION BY o.store_id ORDER BY sum(oi.quantity) DESC) rn
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('DRAFT','CANCELLED','FAILED') AND o.deleted_at IS NULL
          AND ($1::uuid IS NULL OR o.store_id = $1)
        GROUP BY o.store_id, o.store_name, oi.name
      ) t WHERE rn = 1 ORDER BY unidades DESC`,
  },
  {
    key: 'bottom-product-by-store',
    label: 'Producto menos vendido por tienda',
    description: 'El producto con menos unidades vendidas en cada tienda.',
    db: 'orders',
    params: [{ name: 'storeId', type: 'uuid', required: false, label: 'Tienda (opcional)', widget: 'store' }],
    sql: `
      SELECT store_id, store_name, producto, unidades FROM (
        SELECT o.store_id, o.store_name, oi.name AS producto,
               sum(oi.quantity)::int AS unidades,
               row_number() OVER (PARTITION BY o.store_id ORDER BY sum(oi.quantity) ASC) rn
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('DRAFT','CANCELLED','FAILED') AND o.deleted_at IS NULL
          AND ($1::uuid IS NULL OR o.store_id = $1)
        GROUP BY o.store_id, o.store_name, oi.name
      ) t WHERE rn = 1 ORDER BY unidades ASC`,
  },
  {
    key: 'big-spenders',
    label: 'Usuarios que más han recargado',
    description: 'Usuarios cuyo total de recargas aprobadas supera un monto (centavos COP).',
    db: 'financial',
    params: [{ name: 'minAmount', type: 'bigint', required: true, label: 'Monto mínimo (centavos)', default: 1000000 }],
    sql: `
      SELECT w.user_id, u.email,
             sum(t.amount)::bigint AS total_recargas,
             count(*)::int         AS recargas
      FROM wallet_topups t
        JOIN wallets w ON w.id = t.wallet_id
        LEFT JOIN wallet_users u ON u.id = w.user_id
      WHERE t.status = 'APPROVED'
      GROUP BY w.user_id, u.email
      HAVING sum(t.amount) >= $1
      ORDER BY total_recargas DESC`,
  },
  {
    key: 'failed-payments',
    label: 'Pagos fallidos (por razón)',
    description: 'Salud de negocio: pagos de pedidos que fallaron, agrupados por razón.',
    db: 'financial',
    params: [],
    sql: `
      SELECT coalesce(failure_reason, 'DESCONOCIDA') AS razon,
             count(*)::int AS pedidos
      FROM order_transactions
      WHERE status = 'FAILED'
      GROUP BY failure_reason
      ORDER BY pedidos DESC`,
  },
  {
    key: 'stuck-orders',
    label: 'Pedidos atascados',
    description: 'Salud de negocio: pedidos en pago/aprobación más viejos que N minutos (no confirmados).',
    db: 'orders',
    params: [{ name: 'minutes', type: 'int', required: false, label: 'Antigüedad mínima (min)', default: 15 }],
    sql: `
      SELECT status,
             count(*)::int AS pedidos
      FROM orders
      WHERE status IN ('PENDING_PAYMENT','PAYMENT_APPROVED')
        AND deleted_at IS NULL
        AND created_at < now() - (coalesce($1::int, 15) || ' minutes')::interval
      GROUP BY status
      ORDER BY pedidos DESC`,
  },
  {
    key: 'refunds',
    label: 'Reembolsos',
    description: 'Salud de negocio: transacciones reembolsadas (total o parcial) y monto.',
    db: 'financial',
    params: [],
    sql: `
      SELECT status,
             count(*)::int AS transacciones,
             coalesce(sum(refunded_amount), 0)::bigint AS monto_reembolsado
      FROM order_transactions
      WHERE refunded_amount > 0 OR status IN ('REFUNDED','PARTIALLY_REFUNDED')
      GROUP BY status
      ORDER BY transacciones DESC`,
  },
  {
    key: 'peak-hour-by-store',
    label: 'Compras en hora pico por tienda',
    description: 'Cantidad y monto de compras hechas en hora pico, por tienda.',
    db: 'financial',
    params: [{ name: 'storeId', type: 'uuid', required: false, label: 'Tienda (opcional)', widget: 'store' }],
    sql: `
      SELECT store_id,
             count(*)::int          AS compras_pico,
             coalesce(sum(total_charged), 0)::bigint AS monto_total
      FROM order_transactions
      WHERE is_peak_hour = true AND status <> 'FAILED'
        AND ($1::uuid IS NULL OR store_id = $1)
      GROUP BY store_id
      ORDER BY compras_pico DESC`,
  },
];
