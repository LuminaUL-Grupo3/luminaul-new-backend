import { RegisterDto } from '../dto/RegisterDto';
import { LoginDto } from '../dto/LoginDto';
import { AuthUserDto } from '../dto/AuthUserDto';
import { LoginResponseDto } from '../dto/LoginResponseDto';
import { MessageResponseDto } from '../dto/MessageResponseDto';
import { RegisterResponseDto } from '../dto/RegisterResponseDto';

// Cuentas: registro, inicio de sesión, sesión actual y borrado lógico. El controller depende de
// esta abstracción y AuthModule elige la implementación (D de SOLID).
export abstract class AuthService {
  abstract register(dto: RegisterDto): Promise<RegisterResponseDto>;

  abstract login(dto: LoginDto): Promise<LoginResponseDto>;

  // Datos frescos de la base de datos, no del token
  abstract me(userId: string): Promise<AuthUserDto>;

  // Soft delete: la cuenta queda en estado deleted y se cierran todas sus sesiones
  abstract deleteAccount(userId: string): Promise<MessageResponseDto>;
}
