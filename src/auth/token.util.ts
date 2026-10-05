import { createHash, createHmac, timingSafeEqual, randomUUID } from 'crypto';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  exp: number;
  iat?: number;
  jti?: string;
  version?: number;
}

export const SESSION_SECONDS = 60 * 60;

export function signJwt(user: Pick<JwtPayload, 'sub' | 'email' | 'role' | 'version'>, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...user, iat: now, exp: now + SESSION_SECONDS, jti: randomUUID() })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Verifica un JWT HS256 (firma y expiración). Retorna null si es inválido o expiró.
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    if (parsedHeader.alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload;
    if (typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
      || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Cookie httpOnly que usa el front (fetch con credentials: 'include')
export const AUTH_COOKIE = 'access_token';

// El token puede venir en "Authorization: Bearer" o en la cookie de sesión
export function extractToken(authorization?: string, cookieHeader?: string): string | null {
  if (authorization) {
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) return token;
  }
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0 && pair.slice(0, idx).trim() === AUTH_COOKIE) {
        try { return decodeURIComponent(pair.slice(idx + 1).trim()) || null; }
        catch { return null; }
      }
    }
  }
  return null;
}
