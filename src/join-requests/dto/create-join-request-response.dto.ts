import { ApiProperty } from '@nestjs/swagger';
import { JoinRequestItemDto } from './join-request-response.dto';

/**
 * DTO de salida para la H.U 2.1.
 * Reutiliza JoinRequestItemDto (H.U 2.2) para que la solicitud tenga
 * el mismo formato en todo el módulo.
 */
export class CreateJoinRequestResponseDto {
  @ApiProperty({ type: () => JoinRequestItemDto })
  request!: JoinRequestItemDto;

  @ApiProperty({ example: 'Solicitud enviada con éxito' })
  message!: string;
}
