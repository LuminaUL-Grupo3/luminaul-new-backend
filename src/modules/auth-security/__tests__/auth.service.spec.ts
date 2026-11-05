import { ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { UsersRepository } from '../repositories/users.repository';
import { PasswordHasher } from '../providers/password-hasher';
import { OneTimeCodeService, OneTimeCodePurpose } from '../services/one-time-code.service';
import { SessionService } from '../services/session.service';
import { MailSender } from '../providers/mail-sender';
import { UserRole } from '../enums/user-role.enum';
import { UserAccountStatus } from '../enums/user-account-status.enum';
import { UserEntity } from '../entities/user.entity';

describe('AuthService (Unit)', () => {
  let service: AuthService;
  let mockUsersRepo: jest.Mocked<UsersRepository>;
  let mockPasswordHasher: jest.Mocked<PasswordHasher>;
  let mockOneTimeCodes: jest.Mocked<OneTimeCodeService>;
  let mockSessions: jest.Mocked<SessionService>;
  let mockMailSender: jest.Mocked<MailSender>;

  beforeEach(() => {
    mockUsersRepo = {
      existsByEmail: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      build: jest.fn(),
      save: jest.fn(),
      createWithProfile: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('hashed_pw_123'),
      compare: jest.fn(),
    } as unknown as jest.Mocked<PasswordHasher>;

    mockOneTimeCodes = {
      issue: jest.fn().mockReturnValue({ code: '123456', expiresAt: new Date() }),
      consume: jest.fn(),
    } as unknown as jest.Mocked<OneTimeCodeService>;

    mockSessions = {
      issueAccessToken: jest.fn().mockReturnValue('mock_jwt_token'),
      revokeCurrentSession: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    mockMailSender = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MailSender>;

    service = new AuthService(
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

    it('debe lanzar ConflictException si el correo institucional ya existe', async () => {
      mockUsersRepo.existsByEmail.mockResolvedValue(true);

      await expect(
        service.register({
          email: 'existente@aloe.ulima.edu.pe',
          name: 'Usuario Existente',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);

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

    it('debe lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      const activeUser: Partial<UserEntity> = {
        id: 'user-uuid-active',
        email: 'activo@aloe.ulima.edu.pe',
        passwordHash: 'hashed_pw_123',
        status: UserAccountStatus.ACTIVE,
      };
      mockUsersRepo.findByEmail.mockResolvedValue(activeUser as UserEntity);
      mockPasswordHasher.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'activo@aloe.ulima.edu.pe',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException con tiempo constante si el correo no existe', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockPasswordHasher.compare.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'inexistente@aloe.ulima.edu.pe',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar ForbiddenException si el usuario está suspendido', async () => {
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

      await expect(
        service.login({
          email: 'suspendido@aloe.ulima.edu.pe',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

