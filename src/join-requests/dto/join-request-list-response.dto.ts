import { ApiProperty } from '@nestjs/swagger';
import { JoinRequestItemDto } from './join-request-response.dto';

export class JoinRequestListResponseDto {
  @ApiProperty({ type: [JoinRequestItemDto] })
  requests!: JoinRequestItemDto[];

  @ApiProperty({ example: 0 })
  total!: number;

  @ApiProperty({
    example: 'No hay solicitudes pendientes por revisar',
    nullable: true,
    description:
      'Mensaje informativo: "No hay solicitudes pendientes por revisar" si la lista está vacía, o null si hay solicitudes.',
  })
  message!: string | null;
}
