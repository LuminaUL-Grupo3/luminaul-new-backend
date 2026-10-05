import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating!: number;
  @ApiProperty({ maxLength: 2000 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 2000)
  comment!: string;
}
export class CreateReviewDto extends EditReviewDto {
  @ApiProperty()
  @IsUUID()
  reviewed_user_id!: string;
}
