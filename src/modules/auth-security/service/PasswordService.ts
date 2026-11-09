import { ForgotPasswordDto } from '../dto/ForgotPasswordDto';
import { ResetPasswordDto } from '../dto/ResetPasswordDto';
import { ChangePasswordDto } from '../dto/ChangePasswordDto';
import { MessageResponseDto } from '../dto/MessageResponseDto';

// Contraseñas: recuperación con OTP de 6 dígitos y cambio con sesión iniciada
export abstract class PasswordService {
  // Respuesta idéntica exista o no la cuenta, para no revelar qué correos están registrados
  abstract forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponseDto>;

  // Cambia la contraseña e invalida todas las sesiones abiertas
  abstract resetPassword(dto: ResetPasswordDto): Promise<MessageResponseDto>;

  // Verifica la contraseña actual, guarda la nueva y cierra todas las sesiones
  abstract changePassword(userId: string, dto: ChangePasswordDto): Promise<MessageResponseDto>;
}
