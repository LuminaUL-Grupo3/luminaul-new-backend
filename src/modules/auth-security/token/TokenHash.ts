import { createHash } from 'crypto';

// SHA-256 (hex) del token: es lo que se guarda en revoked_tokens, nunca el token en claro
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
