import { VerifyEmailDto } from '../dto/VerifyEmailDto';
import { ResendCodeDto } from '../dto/ResendCodeDto';
import { MessageResponseDto } from '../dto/MessageResponseDto';
import { VerifyEmailResponseDto } from '../dto/VerifyEmailResponseDto';

// Verificación del correo institucional con OTP de 6 dígitos
export abstract class AccountVerificationService {
  abstract verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResponseDto>;

  // Respuesta idéntica exista o no la cuenta, para no revelar qué correos están registrados
  abstract resendCode(dto: ResendCodeDto): Promise<MessageResponseDto>;
}
