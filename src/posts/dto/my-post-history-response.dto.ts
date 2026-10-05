import { CourseResponseDto } from '../../courses/dto/course-response.dto';
import { ApiProperty } from '@nestjs/swagger';

export class MyPostHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['study_group', 'tutoring'] })
  type!: string;
  @ApiProperty()
  description!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  group_id!: string | null;
  @ApiProperty()
  status!: string;
  @ApiProperty()
  created_at!: Date;
  @ApiProperty({ type: CourseResponseDto })
  course!: CourseResponseDto;
}
