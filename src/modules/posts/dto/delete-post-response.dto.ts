import { ApiProperty } from '@nestjs/swagger';

export class DeletePostResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Post eliminado con éxito' })
  message!: string;

  @ApiProperty({ example: '18938a12-6f2b-4d43-9801-bca908234fed' })
  deletedId!: string;

  @ApiProperty()
  deletedAt!: Date;
}
