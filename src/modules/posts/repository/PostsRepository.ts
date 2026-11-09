import { CrudRepository } from './CrudRepository';
import { PostEntity } from '../entities/post.entity';
import { PostUpdateDto } from '../dto/post-update.dto';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

// Repositorio abstracto de publicaciones (SPEC-03).
// Extiende el CRUD genérico e incorpora las consultas específicas del módulo de posts.
// Es una clase abstracta para servir como token de inyección de dependencias en NestJS.
export abstract class PostsRepository extends CrudRepository<string, PostEntity> {
  // Consulta desacoplada para verificar si un grupo existe y está activo
  abstract findGroupById(groupId: string): Promise<{ id: string } | null>;

  // Creación y persistencia de entidad construida por Factory Method
  abstract create(post: PostEntity): Promise<PostEntity>;

  // Feed público con paginación y búsqueda
  abstract getPosts(
    limit: number,
    offset: number,
    search?: string,
  ): Promise<PaginatedResult<PostEntity>>;

  // Consulta por ID con relaciones de profile y course cargadas
  abstract getPostById(postId: string): Promise<PostEntity | null>;

  // Historial de publicaciones de un usuario
  abstract getPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<PostEntity>>;

  // Búsqueda avanzada con filtros combinados (curso, tipo, ciclo, texto)
  abstract searchByFilter(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
    search?: string,
  ): Promise<PaginatedResult<PostEntity>>;

  // Edición de campos modificables de la publicación
  abstract edit(postId: string, postData: PostUpdateDto): Promise<PostEntity | null>;

  // Eliminación lógica (soft delete)
  abstract delete(postId: string): Promise<boolean>;
}

