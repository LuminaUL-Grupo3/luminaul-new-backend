/**
 * Puerto de consulta de administradores activos (módulo auth-security) sin acoplar entidades TypeORM.
 */
export abstract class AdminDirectoryClient {
  abstract findActiveAdminIds(): Promise<string[]>;
}

