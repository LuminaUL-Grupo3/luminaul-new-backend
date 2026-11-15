import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function addOriginsFromCsv(target: Set<string>, raw?: string): void {
  if (!raw) {
    return;
  }

  for (const entry of raw.split(',')) {
    const normalized = normalizeOrigin(entry);
    if (normalized) {
      target.add(normalized);
    }
  }
}

function addDomainOrigins(target: Set<string>, domain?: string): void {
  const trimmed = domain?.trim();
  if (!trimmed) {
    return;
  }

  const normalizedDirect = normalizeOrigin(trimmed);
  if (normalizedDirect) {
    target.add(normalizedDirect);
    return;
  }

  const host = trimmed.replace(/\/+$/, '');
  for (const protocol of ['https', 'http']) {
    const withDefaultPort = normalizeOrigin(`${protocol}://${host}`);
    if (withDefaultPort) {
      target.add(withDefaultPort);
    }
    const withVitePort = normalizeOrigin(`${protocol}://${host}:5173`);
    if (withVitePort) {
      target.add(withVitePort);
    }
  }
}

/**
 * Construye la lista blanca de orígenes permitidos desde WEB_ORIGIN, FRONTEND_URL y DOMAIN.
 * Cuando ninguna variable está configurada (p. ej. desarrollo local), habilita los orígenes locales por defecto.
 */
export function getAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins = new Set<string>();

  addOriginsFromCsv(origins, env.WEB_ORIGIN);
  addOriginsFromCsv(origins, env.FRONTEND_URL);
  addDomainOrigins(origins, env.DOMAIN);

  if (origins.size === 0) {
    for (const localOrigin of DEFAULT_LOCAL_ORIGINS) {
      const normalized = normalizeOrigin(localOrigin);
      if (normalized) {
        origins.add(normalized);
      }
    }
  }

  return Array.from(origins);
}

/**
 * Valida si un Origin HTTP/WebSocket pertenece a la lista blanca configurada.
 * Solicitudes sin cabecera Origin (healthchecks internos, curl o comunicación servidor-servidor) se permiten.
 */
export function isOriginAllowed(
  origin?: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  return getAllowedOrigins(env).includes(normalized);
}

/**
 * Opciones de CORS HTTP para NestJS compatibles con envío de cookies HttpOnly (`credentials: true`).
 */
export function createHttpCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin, env)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
  };
}

