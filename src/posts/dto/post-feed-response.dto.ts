import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseSummaryDto, PostAuthorDto } from './post-response.dto';

export class PostFeedResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  user_id?: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional()
  benefits!: string | null;

  @ApiPropertyOptional()
  requirements!: string | null;

  @ApiPropertyOptional()
  maxCapacity!: number;

  @ApiPropertyOptional()
  max_capacity?: number;

  @ApiPropertyOptional()
  groupId!: string | null;

  @ApiPropertyOptional()
  group_id!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  created_at?: Date;

  @ApiProperty({ type: PostAuthorDto })
  author!: PostAuthorDto;

  @ApiProperty({ type: CourseSummaryDto })
  course!: CourseSummaryDto;
}
