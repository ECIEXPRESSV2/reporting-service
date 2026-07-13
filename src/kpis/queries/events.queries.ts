/**
 * Consultas KQL del FLUJO DE EVENTOS entre microservicios, sobre `AppTraces` de App Insights.
 * Todos los servicios loguean de forma uniforme:
 *   - "Evento publicado: <routingKey>"  (al emitir por el bus)
 *   - "Evento recibido: <routingKey>"   (al consumir del bus)
 *   - fallos de publicación/entrega: "Error publicando evento…", "Fallo publicando…",
 *     "…marcado FAILED", "Entrega … -> FAILED".
 * `AppRoleName` = servicio (SERVICE_NAME). La ventana se aplica por el timespan del SDK.
 *
 * NOTA: los mensajes muertos (dead-letter) NO están en logs; son una MÉTRICA de Service Bus
 * (Azure Monitor metrics), no App Insights logs. Eso va aparte.
 */

// Eventos GENERADOS (publicados) por servicio y routing key.
export const EVENTS_PUBLISHED = `
AppTraces
| where Message startswith "Evento publicado:"
| extend routingKey = tostring(split(Message, ": ", 1)[0])
| summarize eventos = count() by service = tostring(AppRoleName), routingKey
| order by eventos desc
`;

// Eventos RECIBIDOS (consumidos) por servicio y routing key.
export const EVENTS_RECEIVED = `
AppTraces
| where Message startswith "Evento recibido:"
| extend routingKey = tostring(split(Message, ": ", 1)[0])
| summarize eventos = count() by service = tostring(AppRoleName), routingKey
| order by eventos desc
`;

// Eventos FALLIDOS por servicio: fallos de publicación (outbox) y de entrega (notifications).
export const EVENTS_FAILED = `
AppTraces
| where Message has_any ("Error publicando evento", "Fallo publicando evento", "marcado FAILED")
     or (Message startswith "Entrega" and Message has "FAILED")
| extend tipo = case(
    Message has "publicando", "publicacion",
    Message has "marcado FAILED", "outbox_agotado",
    Message startswith "Entrega", "entrega",
    "otro")
| summarize fallos = count(), muestra = any(Message) by service = tostring(AppRoleName), tipo
| order by fallos desc
`;
