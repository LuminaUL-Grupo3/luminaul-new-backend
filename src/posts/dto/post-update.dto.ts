import { IsUUID, IsString, MaxLength, IsIn, IsOptional, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { ALLOWED_POST_TYPES, IsNotBlankConstraint } from './post-create.dto';

export class PostUpdateDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'course_id must be a valid UUID' })
  course_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_POST_TYPES, {
    message: 'type must be tutoring or study_group',
  })
  type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  description?: string;
}
