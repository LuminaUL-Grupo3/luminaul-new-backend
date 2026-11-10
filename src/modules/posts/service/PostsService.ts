import { PostCreateDto } from '../dto/post-create.dto';
import { PostUpdateDto } from '../dto/post-update.dto';
import { PostResponseDto } from '../dto/post-response.dto';
import { PostFeedResponseDto } from '../dto/post-feed-response.dto';
import { MyPostHistoryResponseDto } from '../dto/my-post-history-response.dto';
import { DeletePostResponseDto } from '../dto/delete-post-response.dto';

// Casos de uso de SPEC-03 (Publicaciones y Convocatorias).
// El controlador depende de esta abstracción y PostsModule entrega la implementación concreta (D de SOLID).
export abstract class PostsService {
  // H.U 1.1: Crear publicación usando Factory Method y Adapter
  abstract createPost(postDto: PostCreateDto, userId: string): Promise<PostResponseDto>;

  // H.U 1.5: Feed de publicaciones públicas
  abstract listPosts(limit: number, offset: number, search?: string): Promise<PostFeedResponseDto[]>;

  // H.U 1.3: Búsqueda y filtrado de publicaciones
  abstract filterPosts(
    limit: number,
    offset: number,
    courseId?: string,
    type?: string,
    cycle?: number,
    search?: string,
  ): Promise<PostFeedResponseDto[]>;

  // H.U 1.6: Historial de publicaciones del usuario autenticado
  abstract listPostsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<MyPostHistoryResponseDto[]>;

  // H.U 1.2: Obtener publicación por ID para edición o consulta
  abstract getPostById(postId: string): Promise<PostResponseDto>;

  // H.U 1.2: Editar publicación propia (o administrador según SPEC)
  abstract editPost(
    postId: string,
    payload: PostUpdateDto,
    userId: string,
    userRole?: string,
  ): Promise<PostResponseDto>;

  // H.U 1.4: Eliminar publicación propia (soft delete, o administrador según SPEC)
  abstract deletePost(
    postId: string,
    userId: string,
    userRole?: string,
  ): Promise<DeletePostResponseDto>;
}

