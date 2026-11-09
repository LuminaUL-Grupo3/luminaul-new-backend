import { JwtPayload } from './JwtPayload';

// Adapter: firma y verificación de JWT. Hoy la implementa HmacTokenService (HS256 propio);
// migrar a @nestjs/jwt solo cambia la implementación registrada en AuthModule.
export abstract class TokenService {
  abstract readonly ttlSeconds: number;
  abstract sign(payload: JwtPayload): string;
  // Retorna null si la firma es inválida o el token expiró
  abstract verify(token: string): JwtPayload | null;
}
