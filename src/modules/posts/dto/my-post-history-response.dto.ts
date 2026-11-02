import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseSummaryDto } from './post-response.dto';

export class MyPostHistoryResponseDto {
  @ApiProperty()
  id!: string;

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

  @ApiProperty({ type: CourseSummaryDto })
  course!: CourseSummaryDto;
}
