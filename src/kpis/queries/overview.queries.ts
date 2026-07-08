/**
 * Catálogo de consultas KQL para el overview del centro de monitoreo.
 *
 * SEGURIDAD: son constantes fijas, SIN interpolación de entrada del usuario. El único
 * parámetro variable (el rango temporal) se aplica vía el timespan del SDK, nunca
 * concatenando strings al KQL. Esto evita inyección de KQL y consultas de costo abierto.
 * Cualquier KPI nuevo se agrega aquí como constante allowlisted.
 *
 * Se consultan las tablas clásicas de App Insights (queryResource sobre el recurso).
 */

// Totales globales de peticiones: volumen, fallos y latencias p50/p95.
export const OVERVIEW_TOTALS = `
requests
| summarize
    totalRequests = count(),
    failedRequests = countif(success == false),
    p50Ms = round(percentile(duration, 50), 1),
    p95Ms = round(percentile(duration, 95), 1)
`;

// Desglose por microservicio (cloud_RoleName = SERVICE_NAME): volumen, fallos,
// tasa de error y p95. Ordenado por volumen.
export const OVERVIEW_BY_SERVICE = `
requests
| summarize
    requests = count(),
    failed = countif(success == false),
    p95Ms = round(percentile(duration, 95), 1)
    by service = tostring(cloud_RoleName)
| extend errorRatePct = round(iff(requests == 0, 0.0, 100.0 * failed / requests), 2)
| project service, requests, failed, errorRatePct, p95Ms
| order by requests desc
`;

// Top de excepciones por tipo y servicio, con un mensaje de muestra.
export const OVERVIEW_TOP_EXCEPTIONS = `
exceptions
| summarize count = count(), sampleMessage = any(outerMessage)
    by type = tostring(type), service = tostring(cloud_RoleName)
| project service, type, count, sampleMessage
| order by count desc
| take 10
`;
