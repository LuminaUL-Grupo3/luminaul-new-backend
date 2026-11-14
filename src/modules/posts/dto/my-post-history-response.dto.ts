import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseSummaryDto, PostAuthorDto } from './post-response.dto';

export class MyPostHistoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  userId?: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: 'peach' })
  color!: string;

  @ApiPropertyOptional()
  benefits!: string | null;

  @ApiPropertyOptional()
  requirements!: string | null;

  @ApiPropertyOptional()
  maxCapacity!: number;

  @ApiPropertyOptional()
  groupId!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: PostAuthorDto })
  author?: PostAuthorDto;

  @ApiProperty({ type: CourseSummaryDto })
  course!: CourseSummaryDto;
}
