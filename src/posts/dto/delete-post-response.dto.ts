import { ApiProperty } from '@nestjs/swagger';
export class DeletePostResponseDto {
  @ApiProperty()
  success!: boolean;
  @ApiProperty()
  message!: string;
  @ApiProperty({ format: 'uuid' })
  publication_id!: string;
  @ApiProperty()
  deleted_at!: Date;
}
