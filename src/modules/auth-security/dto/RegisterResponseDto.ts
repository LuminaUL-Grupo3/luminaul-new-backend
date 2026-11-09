import { ApiProperty } from '@nestjs/swagger';
import { UserAccountStatus } from '../enums/UserAccountStatus';

export class RegisterResponseDto {
  @ApiProperty({
    example: 'Usuario registrado correctamente. Por favor revisa tu correo institucional.',
  })
  message!: string;

  @ApiProperty({ format: 'uuid', example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  userId!: string;

  @ApiProperty({ enum: UserAccountStatus, enumName: 'UserAccountStatus', example: UserAccountStatus.PENDING_VERIFICATION })
  status!: UserAccountStatus;
}
