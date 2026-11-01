import { ApiProperty } from '@nestjs/swagger';
import { PostFeedResponseDto } from './post-feed-response.dto';

export class PaginatedPostsResponseDto {
  @ApiProperty({ description: 'Total de registros que coinciden con los filtros', example: 1 })
  total!: number;

  @ApiProperty({ description: 'Límite de elementos por página', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Desplazamiento aplicado', example: 0 })
  offset!: number;

  @ApiProperty({ type: [PostFeedResponseDto], description: 'Lista de publicaciones' })
  items!: PostFeedResponseDto[];
}

