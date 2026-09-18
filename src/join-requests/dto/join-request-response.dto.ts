import { ApiProperty } from '@nestjs/swagger';

export class JoinRequestRequesterDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  user_id!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  name!: string;

  @ApiProperty({ example: 'https://avatar.test/juan.png', nullable: true })
  profile_photo_url!: string | null;
}

export class JoinRequestGroupDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  group_id!: string;

  @ApiProperty({ example: 'Grupo de Estudio Cálculo I' })
  group_name!: string;
}

export class JoinRequestItemDto {
  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  id!: string;

  @ApiProperty({ type: () => JoinRequestGroupDto })
  group!: JoinRequestGroupDto;

  @ApiProperty({ type: () => JoinRequestRequesterDto })
  requester!: JoinRequestRequesterDto;

  @ApiProperty({ enum: ['pending', 'accepted', 'rejected'], example: 'pending' })
  status!: string;

  @ApiProperty({ example: 'Hola, me gustaría unirme al grupo', nullable: true })
  message!: string | null;

  @ApiProperty({ example: '2026-09-18T10:00:00.000Z' })
  created_at!: Date;

  @ApiProperty({ example: null, nullable: true })
  responded_at!: Date | null;
}

export class JoinRequestRespondResponseDto {
  @ApiProperty({ type: () => JoinRequestItemDto })
  request!: JoinRequestItemDto;

  @ApiProperty({ example: 'Solicitud aceptada exitosamente' })
  message!: string;
}
