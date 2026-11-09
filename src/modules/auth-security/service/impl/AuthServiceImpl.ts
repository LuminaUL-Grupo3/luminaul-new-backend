import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuthService } from '../AuthService';
import { OneTimeCodeService } from '../OneTimeCodeService';
import { SessionService } from '../SessionService';
import { UsersRepository } from '../../repository/UsersRepository';
import { PasswordHasher } from '../../strategy/PasswordHasher';
import { MailSender } from '../../mail/MailSender';
import { enforceLoginPolicy } from '../../policy/LoginStatusPolicy';
import { UserEntity } from '../../entities/user.entity';
import { UserRole } from '../../enums/UserRole';
import { UserAccountStatus } from '../../enums/UserAccountStatus';
import { OneTimeCodePurpose } from '../../enums/OneTimeCodePurpose';
import { AuthException } from '../../exception/AuthException';
import { EmailAlreadyRegisteredException } from '../../exception/EmailAlreadyRegisteredException';
import { RegisterDto } from '../../dto/RegisterDto';
import { LoginDto } from '../../dto/LoginDto';
import { AuthUserDto } from '../../dto/AuthUserDto';
import { LoginResponseDto } from '../../dto/LoginResponseDto';
import { MessageResponseDto } from '../../dto/MessageResponseDto';
import { RegisterResponseDto } from '../../dto/RegisterResponseDto';
import { AUTH_MESSAGES } from '../../auth.constants';

@Injectable()
export class AuthServiceImpl extends AuthService implements OnModuleInit {
  // Hash de referencia para comparar aunque el correo no exista (mismo tiempo de respuesta)
  private dummyPasswordHash = '';

  constructor(
    private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly oneTimeCodes: OneTimeCodeService,
    private readonly sessions: SessionService,
    private readonly mailSender: MailSender,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordHasher.hash(randomBytes(16).toString('hex'));
  }

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    if (await this.users.existsByEmail(dto.email)) {
      throw new AuthException(AUTH_MESSAGES.EMAIL_TAKEN, HttpStatus.CONFLICT);
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
    const saved = await this.createWithProfile(user);

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
      throw new AuthException(AUTH_MESSAGES.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }

    // El estado se revisa después de la contraseña para no revelar el estado de cuentas ajenas
    enforceLoginPolicy(user.status);

    return {
      accessToken: this.sessions.issueAccessToken(user),
      user: AuthUserDto.fromEntity(user),
    };
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthException(AUTH_MESSAGES.SESSION_INVALIDATED, HttpStatus.UNAUTHORIZED);
    }
    return AuthUserDto.fromEntity(user);
  }

  // Se conserva la fila para que los user_id de otros módulos sigan siendo válidos
  async deleteAccount(userId: string): Promise<MessageResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthException(AUTH_MESSAGES.SESSION_INVALIDATED, HttpStatus.UNAUTHORIZED);
    }

    const now = new Date();
    await this.users.update(userId, {
      status: UserAccountStatus.DELETED,
      deletedAt: now,
      tokensValidAfter: now,
    });

    return { message: AUTH_MESSAGES.ACCOUNT_DELETED };
  }

  // Carrera entre dos registros simultáneos con el mismo correo: el repositorio avisa con un
  // error de dominio y aquí se traduce a 409
  private async createWithProfile(user: UserEntity): Promise<UserEntity> {
    try {
      return await this.users.createWithProfile(user);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredException) {
        throw new AuthException(AUTH_MESSAGES.EMAIL_TAKEN, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }
}
