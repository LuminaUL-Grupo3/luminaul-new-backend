import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostAuthorDto {
  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  id!: string;

  @ApiPropertyOptional({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  user_id?: string;

  @ApiProperty({ example: 'Martín Vizcarra' })
  name!: string;

  @ApiPropertyOptional({ example: 'https://avatar.test/martin.png' })
  profilePhotoUrl!: string | null;

  @ApiPropertyOptional({ example: 'https://avatar.test/martin.png' })
  profile_photo_url?: string | null;
}

export class CourseSummaryDto {
  @ApiProperty({ example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2' })
  id!: string;

  @ApiProperty({ example: 'Ingeniería de Software I' })
  name!: string;

  @ApiPropertyOptional({ example: 5 })
  cycle!: number | null;
}

export class PostResponseDto {
  @ApiProperty({ example: '18938a12-6f2b-4d43-9801-bca908234fed' })
  id!: string;

  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  userId!: string;

  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  user_id!: string;

  @ApiProperty({ example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2' })
  courseId!: string;

  @ApiProperty({ example: '8c537243-ea7d-411a-8bb7-fce5230bfdf2' })
  course_id!: string;

  @ApiProperty({ example: 'study_group' })
  type!: string;

  @ApiProperty({ example: 'Buscamos 2 personas para repasar antes de la PC1' })
  description!: string;

  @ApiPropertyOptional({ example: 'Material de estudio y asesorías' })
  benefits!: string | null;

  @ApiPropertyOptional({ example: 'Ganas de aprender' })
  requirements!: string | null;

  @ApiProperty({ example: 5, default: 5 })
  maxCapacity!: number;

  @ApiProperty({ example: 5, default: 5 })
  max_capacity!: number;

  @ApiPropertyOptional({ example: '7b134111-9a22-48df-9fa0-cd8213aa0981' })
  groupId!: string | null;

  @ApiPropertyOptional({ example: '7b134111-9a22-48df-9fa0-cd8213aa0981' })
  group_id!: string | null;

  @ApiProperty({ example: 'published' })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiPropertyOptional({ type: PostAuthorDto })
  author?: PostAuthorDto;

  @ApiPropertyOptional({ type: CourseSummaryDto })
  course?: CourseSummaryDto;
}
