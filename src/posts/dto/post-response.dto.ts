import { ApiProperty } from '@nestjs/swagger';
export class PostResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  user_id!: string;
  @ApiProperty({ format: 'uuid' })
  course_id!: string;
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
  @ApiProperty()
  updated_at!: Date;
}
