import { createHash, createHmac, timingSafeEqual } from 'crypto';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  exp: number;
  iat?: number;
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
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
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
        return decodeURIComponent(pair.slice(idx + 1).trim()) || null;
      }
    }
  }
  return null;
}
