/**
 * Catálogo de consultas KQL para el overview del centro de monitoreo.
 *
 * SEGURIDAD: son constantes fijas, SIN interpolación de entrada del usuario. El único
 * parámetro variable (el rango temporal) se aplica vía el timespan del SDK, nunca
 * concatenando strings al KQL. Esto evita inyección de KQL y consultas de costo abierto.
 * Cualquier KPI nuevo se agrega aquí como constante allowlisted.
 *
 * Se consulta el Log Analytics workspace (App Insights es workspace-based), así que se
 * usan las tablas de esquema workspace (AppRequests, AppExceptions, …) y AppRoleName
 * como identificador de servicio (equivalen a requests/exceptions/cloud_RoleName del
 * esquema clásico).
 */

// Totales globales de peticiones: volumen, fallos y latencias p50/p95.
export const OVERVIEW_TOTALS = `
AppRequests
| summarize
    totalRequests = count(),
    failedRequests = countif(Success == false),
    p50Ms = round(percentile(DurationMs, 50), 1),
    p95Ms = round(percentile(DurationMs, 95), 1)
`;

// Desglose por microservicio (AppRoleName = SERVICE_NAME): volumen, fallos,
// tasa de error y p95. Ordenado por volumen.
export const OVERVIEW_BY_SERVICE = `
AppRequests
| summarize
    requests = count(),
    failed = countif(Success == false),
    p95Ms = round(percentile(DurationMs, 95), 1)
    by service = tostring(AppRoleName)
| extend errorRatePct = round(iff(requests == 0, 0.0, 100.0 * failed / requests), 2)
| project service, requests, failed, errorRatePct, p95Ms
| order by requests desc
`;

// Top de excepciones por tipo y servicio, con un mensaje de muestra.
export const OVERVIEW_TOP_EXCEPTIONS = `
AppExceptions
| summarize count = count(), sampleMessage = any(OuterMessage)
    by type = tostring(ExceptionType), service = tostring(AppRoleName)
| project service, type, count, sampleMessage
| order by count desc
| take 10
`;
