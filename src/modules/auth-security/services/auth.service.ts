import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UsersRepository } from '../repositories/users.repository';
import { PasswordHasher } from '../providers/password-hasher';
import { OneTimeCodePurpose, OneTimeCodeService } from './one-time-code.service';
import { SessionService } from './session.service';
import { MailSender } from '../providers/mail-sender';
import { enforceLoginPolicy } from '../policies/login-status.policy';
import { UserRole } from '../enums/user-role.enum';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import {
  AuthUserDto,
  LoginResponseDto,
  MessageResponseDto,
  RegisterResponseDto,
} from '../dto/auth-response.dto';
import { AUTH_MESSAGES } from '../auth.constants';
import { JwtPayload } from '../token.util';

// Cuentas: registro, inicio de sesión, sesión actual y borrado lógico
@Injectable()
export class AuthService implements OnModuleInit {
  // Hash de referencia para comparar aunque el correo no exista (mismo tiempo de respuesta)
  private dummyPasswordHash = '';

  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly oneTimeCodes: OneTimeCodeService,
    private readonly sessions: SessionService,
    private readonly mailSender: MailSender,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordHasher.hash(randomBytes(16).toString('hex'));
  }

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    if (await this.users.existsByEmail(dto.email)) {
      throw new ConflictException(AUTH_MESSAGES.EMAIL_TAKEN);
    }

    const user = this.users.build({
      email: dto.email,
      name: dto.name,
      passwordHash: await this.passwordHasher.hash(dto.password),
      role: UserRole.STUDENT,
      status: UserAccountStatus.PENDING_VERIFICATION,
      isVerified: false,
    });
    const issued = this.oneTimeCodes.issue(user, OneTimeCodePurpose.EMAIL_VERIFICATION);
    const saved = await this.users.createWithProfile(user);

    await this.mailSender.sendVerificationCode({ to: saved.email, name: saved.name, ...issued });

    return { message: AUTH_MESSAGES.REGISTERED, userId: saved.id, status: saved.status };
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = await this.passwordHasher.compare(
      dto.password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    // El estado se revisa después de la contraseña para no revelar el estado de cuentas ajenas
    enforceLoginPolicy(user.status);

    return {
      accessToken: this.sessions.issueAccessToken(user),
      user: AuthUserDto.fromEntity(user),
    };
  }

  // Datos frescos de la base de datos, no del token
  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_INVALIDATED);
    }
    return AuthUserDto.fromEntity(user);
  }

  // Soft delete: se conserva la fila para que los user_id de otros módulos sigan siendo válidos
  async deleteAccount(userId: string): Promise<MessageResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.SESSION_INVALIDATED);
    }

    const now = new Date();
    await this.users.update(userId, {
      status: UserAccountStatus.DELETED,
      deletedAt: now,
      tokensValidAfter: now,
    });

    return { message: AUTH_MESSAGES.ACCOUNT_DELETED };
  }

  // Compatibilidad con test/e2e-integration-runner.ts: delega en la cadena de SessionService
  async validateToken(token: string): Promise<JwtPayload> {
    return (await this.sessions.validate(token)).payload;
  }
}
