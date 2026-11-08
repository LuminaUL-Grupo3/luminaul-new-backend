import { PostEntity } from '../entities/post.entity';

/**
 * Puerto hacia el sistema de moderación asíncrona (SPEC-06).
 * Posts notifica que se ha creado o editado texto; la moderación decide las sanciones de forma desacoplada.
 */
export abstract class ModerationClient {
  abstract publicationCreated(post: PostEntity): void;
}

