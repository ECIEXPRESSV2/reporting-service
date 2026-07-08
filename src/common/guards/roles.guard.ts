import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Roles con acceso al centro de monitoreo. ANALYST es el "rol de solo lectura de
 * métricas" (ya reconocido por el gateway en ROLE_PRIORITY) para gente que observa
 * KPIs sin permisos de administración.
 */
const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

/**
 * Autoriza por el header x-user-role que INYECTA el gateway tras validar el token
 * Firebase (header-injector.ts: pickEffectiveRole). El gateway ya borra cualquier
 * x-user-role que venga del cliente, así que confiar en él aquí es seguro.
 *
 * Nota: el gateway envía el rol EFECTIVO (el de mayor prioridad). Un usuario que sea
 * VENDOR y ANALYST a la vez enviaría VENDOR y sería rechazado; es el mismo modelo que
 * usan los demás servicios. Si en el futuro se necesita, el gateway puede propagar la
 * lista completa de roles en un header aparte.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const role = (
      req.headers['x-user-role'] as string | undefined
    )?.toUpperCase();

    if (role && ALLOWED_ROLES.has(role)) return true;

    this.logger.warn(
      `Acceso denegado al centro de monitoreo (rol='${role ?? 'ninguno'}').`,
    );
    throw new ForbiddenException(
      'Se requiere el rol ADMIN o ANALYST para acceder al centro de monitoreo.',
    );
  }
}
