import { AUTH_COOKIE } from '../auth.constants';

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
