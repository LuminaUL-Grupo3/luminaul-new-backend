import { IsUUID, IsString, MaxLength, IsIn, IsOptional, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { ALLOWED_POST_TYPES, IsNotBlankConstraint } from './post-create.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PostUpdateDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'course_id must be a valid UUID' })
  course_id?: string;

  @ApiPropertyOptional({ enum: ALLOWED_POST_TYPES })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @IsIn(ALLOWED_POST_TYPES, {
    message: 'type must be tutoring or study_group',
  })
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Validate(IsNotBlankConstraint)
  description?: string;
}
