import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const JOIN_REQUEST_MESSAGE_MAX_LENGTH = 1000;

/**
 * DTO de entrada para la H.U 2.1 — Enviar solicitud de unión a un grupo de estudio.
 *
 * Solo contiene validaciones de FORMATO. Las reglas de negocio (el grupo existe,
 * el alumno no es miembro, no tiene una solicitud pendiente) se validan en
 * JoinRequestsService.createRequest().
 *
 * El grupo destino viaja en la ruta (/groups/:group_id/join-requests) y el
 * solicitante se obtiene de la sesión (@CurrentUser), por eso no forman parte del body.
 */
export class CreateJoinRequestDto {
  @ApiProperty({
    description: 'Mensaje de presentación para el administrador del grupo',
    example: 'Hola, me gustaría unirme para repasar árboles y grafos antes de la PC2.',
    maxLength: JOIN_REQUEST_MESSAGE_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El mensaje debe ser un texto' })
  @IsNotEmpty({ message: 'El mensaje es requerido' })
  @MaxLength(JOIN_REQUEST_MESSAGE_MAX_LENGTH, {
    message: `El mensaje no puede superar los ${JOIN_REQUEST_MESSAGE_MAX_LENGTH} caracteres`,
  })
  message!: string;
}
