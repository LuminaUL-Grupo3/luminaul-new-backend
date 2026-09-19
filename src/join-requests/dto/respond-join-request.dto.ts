import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class RespondJoinRequestDto {
  @ApiProperty({
    description: 'Acción a realizar sobre la solicitud',
    enum: ['accepted', 'rejected'],
    example: 'accepted',
  })
  @IsNotEmpty({ message: 'La acción es requerida' })
  @IsString({ message: 'La acción debe ser un texto' })
  @IsIn(['accepted', 'rejected'], {
    message: 'La acción debe ser "accepted" o "rejected"',
  })
  action!: 'accepted' | 'rejected';
}
