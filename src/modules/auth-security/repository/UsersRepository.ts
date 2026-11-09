import { UserEntity } from '../entities/user.entity';

// Repository (DAO): acceso a la tabla users para el módulo de autenticación. Los servicios
// dependen de esta abstracción y no ven TypeORM ni SQL.
export abstract class UsersRepository {
  // Incluye cuentas borradas lógicamente: el correo sigue ocupado
  abstract findByEmail(email: string): Promise<UserEntity | null>;

  abstract findById(id: string): Promise<UserEntity | null>;

  abstract existsByEmail(email: string): Promise<boolean>;

  // Crea la entidad en memoria, sin guardarla
  abstract build(data: Partial<UserEntity>): UserEntity;

  abstract save(user: UserEntity): Promise<UserEntity>;

  abstract update(id: string, changes: Partial<UserEntity>): Promise<void>;

  // Crea el usuario y su perfil en una sola transacción.
  // Lanza EmailAlreadyRegisteredException si el correo ya existe.
  abstract createWithProfile(user: UserEntity): Promise<UserEntity>;
}
