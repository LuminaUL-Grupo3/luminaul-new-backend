import { HttpStatus } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { AuthServiceImpl } from '../service/impl/AuthServiceImpl';
import { UsersRepository } from '../repository/UsersRepository';
import { PasswordHasher } from '../strategy/PasswordHasher';
import { OneTimeCodeService } from '../service/OneTimeCodeService';
import { SessionService } from '../service/SessionService';
import { MailSender } from '../mail/MailSender';
import { OneTimeCodePurpose } from '../enums/OneTimeCodePurpose';
import { UserRole } from '../enums/UserRole';
import { UserAccountStatus } from '../enums/UserAccountStatus';
import { UserEntity } from '../entities/user.entity';
import { AuthException } from '../exception/AuthException';

describe('AuthService (Unit)', () => {
  let service: AuthServiceImpl;
  let mockUsersRepo: Mocked<UsersRepository>;
  let mockPasswordHasher: Mocked<PasswordHasher>;
  let mockOneTimeCodes: Mocked<OneTimeCodeService>;
  let mockSessions: Mocked<SessionService>;
  let mockMailSender: Mocked<MailSender>;

  beforeEach(() => {
    mockUsersRepo = {
      existsByEmail: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      build: vi.fn(),
      save: vi.fn(),
      createWithProfile: vi.fn(),
    } as unknown as Mocked<UsersRepository>;

    mockPasswordHasher = {
      hash: vi.fn().mockResolvedValue('hashed_pw_123'),
      compare: vi.fn(),
    } as unknown as Mocked<PasswordHasher>;

    mockOneTimeCodes = {
      issue: vi.fn().mockReturnValue({ code: '123456', expiresAt: new Date() }),
      consume: vi.fn(),
    } as unknown as Mocked<OneTimeCodeService>;

    mockSessions = {
      issueAccessToken: vi.fn().mockReturnValue('mock_jwt_token'),
      revokeCurrentSession: vi.fn(),
    } as unknown as Mocked<SessionService>;

    mockMailSender = {
      sendVerificationCode: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetCode: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<MailSender>;

    service = new AuthServiceImpl(
      mockUsersRepo,
      mockPasswordHasher,
      mockOneTimeCodes,
      mockSessions,
      mockMailSender,
    );
  });

  describe('register', () => {
    it('debe registrar un nuevo usuario y emitir código OTP (Happy Path)', async () => {
      mockUsersRepo.existsByEmail.mockResolvedValue(false);
      const fakeUser: Partial<UserEntity> = {
        id: 'user-uuid-1',
        email: 'alumno@aloe.ulima.edu.pe',
        name: 'Alumno Prueba',
        status: UserAccountStatus.PENDING_VERIFICATION,
        role: UserRole.STUDENT,
        isVerified: false,
      };
      mockUsersRepo.build.mockReturnValue(fakeUser as UserEntity);
      mockUsersRepo.createWithProfile.mockResolvedValue(fakeUser as UserEntity);

      const result = await service.register({
        email: 'alumno@aloe.ulima.edu.pe',
        name: 'Alumno Prueba',
        password: 'Password123!',
      });

      expect(mockUsersRepo.existsByEmail).toHaveBeenCalledWith('alumno@aloe.ulima.edu.pe');
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('Password123!');
      expect(mockOneTimeCodes.issue).toHaveBeenCalledWith(fakeUser, OneTimeCodePurpose.EMAIL_VERIFICATION);
      expect(mockMailSender.sendVerificationCode).toHaveBeenCalled();
      expect(result.userId).toBe('user-uuid-1');
      expect(result.status).toBe(UserAccountStatus.PENDING_VERIFICATION);
    });

    it('debe lanzar AuthException 409 si el correo institucional ya existe', async () => {
      mockUsersRepo.existsByEmail.mockResolvedValue(true);

      const result = service.register({
        email: 'existente@aloe.ulima.edu.pe',
        name: 'Usuario Existente',
        password: 'Password123!',
      });
      await expect(result).rejects.toThrow(AuthException);
      await expect(result).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

      expect(mockUsersRepo.createWithProfile).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('debe autenticar credenciales válidas y emitir token (Happy Path)', async () => {
      const activeUser: Partial<UserEntity> = {
        id: 'user-uuid-active',
        email: 'activo@aloe.ulima.edu.pe',
        passwordHash: 'hashed_pw_123',
        status: UserAccountStatus.ACTIVE,
        role: UserRole.STUDENT,
        isVerified: true,
        tokensValidAfter: new Date(Date.now() - 10000),
      };
      mockUsersRepo.findByEmail.mockResolvedValue(activeUser as UserEntity);
      mockPasswordHasher.compare.mockResolvedValue(true);

      const response = await service.login({
        email: 'activo@aloe.ulima.edu.pe',
        password: 'Password123!',
      });

      expect(response.accessToken).toBe('mock_jwt_token');
      expect(response.user.id).toBe('user-uuid-active');
      expect(mockSessions.issueAccessToken).toHaveBeenCalledWith(activeUser);
    });

    it('debe lanzar AuthException 401 si la contraseña es incorrecta', async () => {
      const activeUser: Partial<UserEntity> = {
        id: 'user-uuid-active',
        email: 'activo@aloe.ulima.edu.pe',
        passwordHash: 'hashed_pw_123',
        status: UserAccountStatus.ACTIVE,
      };
      mockUsersRepo.findByEmail.mockResolvedValue(activeUser as UserEntity);
      mockPasswordHasher.compare.mockResolvedValue(false);

      const result = service.login({
        email: 'activo@aloe.ulima.edu.pe',
        password: 'WrongPassword',
      });
      await expect(result).rejects.toThrow(AuthException);
      await expect(result).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    });

    it('debe lanzar AuthException 401 con tiempo constante si el correo no existe', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockPasswordHasher.compare.mockResolvedValue(false);

      const result = service.login({
        email: 'inexistente@aloe.ulima.edu.pe',
        password: 'Password123!',
      });
      await expect(result).rejects.toThrow(AuthException);
      await expect(result).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    });

    it('debe lanzar AuthException 403 si el usuario está suspendido', async () => {
      const suspendedUser: Partial<UserEntity> = {
        id: 'user-uuid-suspended',
        email: 'suspendido@aloe.ulima.edu.pe',
        passwordHash: 'hashed_pw_123',
        status: UserAccountStatus.SUSPENDED,
        role: UserRole.STUDENT,
        isVerified: true,
      };
      mockUsersRepo.findByEmail.mockResolvedValue(suspendedUser as UserEntity);
      mockPasswordHasher.compare.mockResolvedValue(true);

      const result = service.login({
        email: 'suspendido@aloe.ulima.edu.pe',
        password: 'Password123!',
      });
      await expect(result).rejects.toThrow(AuthException);
      await expect(result).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });
  });
});

