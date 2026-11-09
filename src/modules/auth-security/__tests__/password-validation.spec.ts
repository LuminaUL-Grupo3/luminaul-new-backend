import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { ChangePasswordDto } from '../dto/ChangePasswordDto';
import { LoginDto } from '../dto/LoginDto';
import { RegisterDto } from '../dto/RegisterDto';
import { ResetPasswordDto } from '../dto/ResetPasswordDto';
import { VerifyEmailDto } from '../dto/VerifyEmailDto';
import { PasswordServiceImpl } from '../service/impl/PasswordServiceImpl';
import { UsersRepository } from '../repository/UsersRepository';
import { PasswordHasher } from '../strategy/PasswordHasher';
import { OneTimeCodeService } from '../service/OneTimeCodeService';
import { MailSender } from '../mail/MailSender';
import { UserEntity } from '../entities/user.entity';
import { AuthException } from '../exception/AuthException';
import { AUTH_MESSAGES } from '../auth.constants';

// Misma configuración que el ValidationPipe global de main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function validationMessages(metatype: unknown, body: unknown): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype: metatype as never });
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as { message: string[] };
    return response.message;
  }
}

const VALID_CHANGE = { current_password: 'ActualSegura123', password: 'NuevaSegura456' };

describe('ChangePasswordDto', () => {
  it('acepta lo que envía SettingsPage', async () => {
    expect(await validationMessages(ChangePasswordDto, VALID_CHANGE)).toEqual([]);
  });

  it.each([
    ['sin contraseña actual', { password: 'NuevaSegura456' }, 'Debes ingresar tu contraseña actual'],
    ['sin nueva contraseña', { current_password: 'ActualSegura123' }, 'Debes ingresar tu nueva contraseña'],
    ['nueva contraseña vacía', { ...VALID_CHANGE, password: '' }, 'Debes ingresar tu nueva contraseña'],
    ['nueva contraseña corta', { ...VALID_CHANGE, password: 'corta' }, 'La contraseña debe tener por lo menos 10 caracteres'],
    ['solo espacios', { ...VALID_CHANGE, password: '            ' }, 'La contraseña no puede estar formada solo por espacios'],
    ['más de 72 bytes', { ...VALID_CHANGE, password: 'ñ'.repeat(40) }, 'La contraseña no puede superar los 72 caracteres (las letras con tilde y la ñ cuentan como dos)'],
    ['nueva contraseña nula', { ...VALID_CHANGE, password: null }, 'Debes ingresar tu nueva contraseña'],
  ])('%s: un único mensaje en español', async (_case, body, expected) => {
    expect(await validationMessages(ChangePasswordDto, body)).toEqual([expected]);
  });

  it('acepta exactamente 72 bytes', async () => {
    expect(await validationMessages(ChangePasswordDto, { ...VALID_CHANGE, password: 'a'.repeat(72) })).toEqual([]);
  });
});

describe('mensajes en español en los demás DTOs de auth', () => {
  const english = /\b(must|should|property|longer|shorter|string|empty)\b/i;

  it.each([
    ['login vacío', LoginDto, { email: '', password: '' }],
    ['login con valores nulos', LoginDto, { email: null, password: null }],
    ['registro vacío', RegisterDto, { email: '', password: '', name: '' }],
    ['registro con tipos inválidos', RegisterDto, { email: 'a@aloe.ulima.edu.pe', password: {}, name: [] }],
    ['reset vacío', ResetPasswordDto, { email: '', token: '', newPassword: '' }],
    ['verificación con token nulo', VerifyEmailDto, { email: 'a@aloe.ulima.edu.pe', token: null }],
  ])('%s', async (_case, metatype, body) => {
    const messages = await validationMessages(metatype, body);
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) expect(message).not.toMatch(english);
  });

  it('registro y reset aplican la misma política que el cambio de contraseña', async () => {
    const base = { email: '20210001@aloe.ulima.edu.pe', name: 'Martín' };
    expect(await validationMessages(RegisterDto, { ...base, password: ' '.repeat(12) })).toEqual([
      'La contraseña no puede estar formada solo por espacios',
    ]);
    expect(
      await validationMessages(ResetPasswordDto, { email: base.email, token: '123456', newPassword: 'x'.repeat(73) }),
    ).toEqual(['La contraseña no puede superar los 72 caracteres (las letras con tilde y la ñ cuentan como dos)']);
  });

  it('el login no aplica la política nueva (acepta contraseñas ya guardadas)', async () => {
    expect(await validationMessages(LoginDto, { email: 'a@aloe.ulima.edu.pe', password: 'corta' })).toEqual([]);
  });
});

describe('PasswordService.changePassword', () => {
  let service: PasswordServiceImpl;
  let users: jest.Mocked<UsersRepository>;
  let hasher: jest.Mocked<PasswordHasher>;
  let user: UserEntity;

  beforeEach(() => {
    user = Object.assign(new UserEntity(), {
      id: 'user-1',
      passwordHash: 'hash-actual',
      tokensValidAfter: new Date('2026-01-01T00:00:00Z'),
    });
    users = {
      findById: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation(async (u: UserEntity) => u),
    } as unknown as jest.Mocked<UsersRepository>;
    hasher = {
      compare: jest.fn().mockImplementation(async (plain: string) => plain === 'ActualSegura123'),
      hash: jest.fn().mockResolvedValue('hash-nuevo'),
    } as unknown as jest.Mocked<PasswordHasher>;
    service = new PasswordServiceImpl(
      users,
      hasher,
      {} as OneTimeCodeService,
      {} as MailSender,
    );
  });

  it('guarda la nueva contraseña y cierra todas las sesiones', async () => {
    const before = Date.now();
    const result = await service.changePassword('user-1', VALID_CHANGE);
    expect(result.message).toBe(AUTH_MESSAGES.PASSWORD_CHANGED);
    expect(hasher.hash).toHaveBeenCalledWith('NuevaSegura456');
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: 'hash-nuevo' }));
    expect(user.tokensValidAfter.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rechaza una contraseña actual incorrecta sin guardar nada', async () => {
    await expect(
      service.changePassword('user-1', { ...VALID_CHANGE, current_password: 'Equivocada123' }),
    ).rejects.toThrow(new AuthException(AUTH_MESSAGES.WRONG_CURRENT_PASSWORD));
    expect(users.save).not.toHaveBeenCalled();
  });

  it('rechaza que la nueva contraseña sea igual a la actual', async () => {
    await expect(
      service.changePassword('user-1', { current_password: 'ActualSegura123', password: 'ActualSegura123' }),
    ).rejects.toThrow(new AuthException(AUTH_MESSAGES.SAME_PASSWORD));
    expect(users.save).not.toHaveBeenCalled();
  });

  it('responde 401 si el usuario de la sesión ya no existe', async () => {
    users.findById.mockResolvedValueOnce(null);
    const result = service.changePassword('user-1', VALID_CHANGE);
    await expect(result).rejects.toBeInstanceOf(AuthException);
    await expect(result).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
  });
});
