// Repository (DAO): lista de tokens revocados por logout (se guarda solo el SHA-256)
export abstract class RevokedTokensRepository {
  abstract isRevoked(tokenHash: string): Promise<boolean>;

  // Idempotente: revocar dos veces el mismo token no falla
  abstract revoke(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;

  // Un token expirado ya es rechazado por su exp, así que su registro sobra
  abstract purgeExpired(): Promise<void>;
}
