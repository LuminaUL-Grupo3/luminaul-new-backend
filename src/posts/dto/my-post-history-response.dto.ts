import { CourseResponseDto } from '../../courses/dto/course-response.dto';

export class MyPostHistoryResponseDto {
  id!: string;
  type!: string;
  description!: string;
  group_id!: string | null;
  status!: string;
  created_at!: Date;
  course!: CourseResponseDto;
}
