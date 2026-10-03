import { ApiProperty } from '@nestjs/swagger';

export class LogoutResponseDto {
  @ApiProperty({ example: 'Sesión cerrada correctamente' })
  message!: string;
}
