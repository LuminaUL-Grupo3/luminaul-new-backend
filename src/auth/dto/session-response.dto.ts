import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['student', 'admin'] }) role!: string;
}
