// Patrón Repository: contrato CRUD genérico para persistencia de entidades.
// Es una clase abstracta para funcionar como token de inyección de dependencias en NestJS.
export abstract class CrudRepository<ID, E> {
  abstract findById(id: ID): Promise<E | null>;

  abstract findAll(): Promise<E[]>;

  abstract insert(entity: Partial<E>): Promise<E>;

  abstract update(entity: E): Promise<E>;

  abstract delete(id: ID): Promise<boolean>;
}

