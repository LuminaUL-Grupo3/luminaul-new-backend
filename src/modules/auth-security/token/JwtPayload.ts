import { randomUUID } from 'crypto';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  exp: number;
  iat?: number;
  jti?: string;
}

// Construye el payload de acceso: única fuente de sus campos (sin hash ni códigos OTP)
export function buildJwtPayload(
  user: { id: string; email: string; role: string },
  issuedAtSeconds: number,
  ttlSeconds: number,
): JwtPayload {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ttlSeconds,
    // Identificador único: dos logins en el mismo segundo no generan el mismo token
    // (si no, revocar uno revocaría también el otro)
    jti: randomUUID(),
  };
}
