export class PostResponseDto {
  id!: string;
  user_id!: string;
  course_id!: string;
  type!: string;
  description!: string;
  group_id!: string | null;
  status!: string;
  created_at!: Date;
  updated_at!: Date;
}
