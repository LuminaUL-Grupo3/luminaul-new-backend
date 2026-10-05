import { ApiProperty } from '@nestjs/swagger';
export class CourseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: Number, nullable: true })
  cycle!: number | null;
}
