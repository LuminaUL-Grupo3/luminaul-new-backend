// Patrón Repository: contrato CRUD mínimo para dar mantenimiento a una tabla; equivale al Dao<ID, E> del
// proyecto de la Semana 08. El service nunca ve SQL ni TypeORM.
// Es una clase abstracta (no una interface) porque NestJS la usa como token de inyección.
export abstract class CrudRepository<ID, E> {
  abstract findById(id: ID): Promise<E | null>;

  abstract findAll(): Promise<E[]>;

  abstract insert(entity: Partial<E>): Promise<E>;

  abstract update(entity: E): Promise<E>;

  abstract delete(id: ID): Promise<boolean>;
}
