import { ApiProperty } from '@nestjs/swagger';
import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  IsNewPassword,
  IsRequiredText,
  NEW_PASSWORD_REQUIRED_MESSAGE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
} from './auth-validation.constants';

// Cambio de contraseña con sesión iniciada. Los nombres de campo son los que ya envía
// SettingsPage (features/profile). Un solo contrato: aceptar dos variantes de cada campo hacía
// que se exigieran las cuatro y que toda petición fallara.
export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual del usuario', example: 'ActualSegura123' })
  @IsRequiredText(CURRENT_PASSWORD_REQUIRED_MESSAGE)
  current_password!: string;

  @ApiProperty({
    description: 'Nueva contraseña',
    example: 'NuevaSegura456!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_BYTES,
  })
  @IsNewPassword(NEW_PASSWORD_REQUIRED_MESSAGE)
  password!: string;
}
