import { ApiProperty } from '@nestjs/swagger';

export const GROUP_MEMBERSHIP_STATUSES = ['admin', 'member', 'pending', 'none'] as const;
export type GroupMembershipStatus = (typeof GROUP_MEMBERSHIP_STATUSES)[number];

export class GroupAdminDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  user_id!: string;

  @ApiProperty({ example: 'Martín Vizcarra' })
  name!: string;

  @ApiProperty({ example: 'https://avatar.test/martin.png', nullable: true })
  profile_photo_url!: string | null;
}

/**
 * DTO de salida de GET /groups/:group_id (H.U 2.1).
 * my_status indica la relación del usuario actual con el grupo y permite al
 * frontend decidir si muestra el botón "Enviar solicitud" (solo si es 'none').
 */
export class GroupDetailResponseDto {
  @ApiProperty({ example: '8fa85f64-5717-4562-b3fc-2c963f66afa8' })
  id!: string;

  @ApiProperty({ example: 'Grupo de Estructuras de Datos' })
  name!: string;

  @ApiProperty({ example: 'Repaso para la PC2', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'Ejercicios resueltos', nullable: true })
  benefits!: string | null;

  @ApiProperty({ example: 'Conocimiento en C++', nullable: true })
  requirements!: string | null;

  @ApiProperty({ example: 'virtual', nullable: true })
  meeting_mode!: string | null;

  @ApiProperty({ example: 'noche', nullable: true })
  meeting_shift!: string | null;

  @ApiProperty({ example: 6, nullable: true })
  max_capacity!: number | null;

  @ApiProperty({ example: 3 })
  member_count!: number;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  admin_id!: string;

  @ApiProperty({ type: () => GroupAdminDto })
  admin!: GroupAdminDto;

  @ApiProperty({
    enum: GROUP_MEMBERSHIP_STATUSES,
    example: 'none',
    description:
      'Relación del usuario actual con el grupo: admin, member, pending (solicitud pendiente) o none',
  })
  my_status!: GroupMembershipStatus;

  @ApiProperty({ example: '2026-09-20T18:40:00.000Z' })
  created_at!: Date;
}
