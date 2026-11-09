import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailResponseDto {
  @ApiProperty({ example: 'Cuenta verificada exitosamente. Ya puedes iniciar sesión.' })
  message!: string;

  @ApiProperty({ example: true })
  isVerified!: boolean;
}
