import { ApiProperty } from '@nestjs/swagger';
import { IsNewPassword, IsRequiredText } from '../validator/AuthValidators';
import { AUTH_LIMITS, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

// Cambio de contraseña con sesión iniciada. Los nombres de campo son los que ya envía
// SettingsPage (features/profile). Un solo contrato: aceptar dos variantes de cada campo hacía
// que se exigieran las cuatro y que toda petición fallara.
export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual del usuario', example: 'ActualSegura123' })
  @IsRequiredText(AUTH_VALIDATION_MESSAGES.CURRENT_PASSWORD_REQUIRED)
  currentPassword!: string;

  @ApiProperty({
    description: 'Nueva contraseña',
    example: 'NuevaSegura456!',
    minLength: AUTH_LIMITS.PASSWORD_MIN_LENGTH,
    maxLength: AUTH_LIMITS.PASSWORD_MAX_BYTES,
  })
  @IsNewPassword(AUTH_VALIDATION_MESSAGES.NEW_PASSWORD_REQUIRED)
  password!: string;
}
