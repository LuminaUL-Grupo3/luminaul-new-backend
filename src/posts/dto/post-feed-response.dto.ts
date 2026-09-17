import { CourseResponseDto } from '../../courses/dto/course-response.dto';

export class PostAuthorResponseDto {
  user_id!: string;
  name!: string;
  profile_photo_url!: string | null;
}

export class PostFeedResponseDto {
  id!: string;
  type!: string;
  description!: string;
  group_id!: string | null;
  status!: string;
  created_at!: Date;
  author!: PostAuthorResponseDto;
  course!: CourseResponseDto;
}
