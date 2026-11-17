import { HttpStatus } from '@nestjs/common';
import { type Mocked } from 'vitest';
import { AccountVerificationServiceImpl } from '../service/impl/AccountVerificationServiceImpl';
import { UsersRepository } from '../repository/UsersRepository';
import { OneTimeCodeService } from '../service/OneTimeCodeService';
import { MailSender } from '../mail/MailSender';
import { UserEntity } from '../entities/user.entity';
import { UserAccountStatus } from '../enums/UserAccountStatus';
import { OneTimeCodePurpose } from '../enums/OneTimeCodePurpose';
import { AuthException } from '../exception/AuthException';
import { AUTH_MESSAGES } from '../auth.constants';

// Prueba de caja blanca de AccountVerificationServiceImpl.verifyEmail (CC = 5).
//
// Decisiones del método:
//   D1  if (!user)
//   D2  if (user.status === ACTIVE && user.isVerified)
//         D2a  user.status === ACTIVE
//         D2b  user.isVerified            (solo se evalúa si D2a es verdadera)
//   D3  if (user.status !== PENDING_VERIFICATION)
//
// Caminos independientes (uno por caso) y ramas que cubre cada uno:
//   C1  D1 V                                   -> 400 INVALID_CODE
//   C2  D1 F, D2a V, D2b V                     -> 400 ALREADY_VERIFIED
//   C3  D1 F, D2a V, D2b F, D3 V               -> 400 INVALID_CODE
//   C4  D1 F, D2a F (cortocircuito), D3 V      -> 400 INVALID_CODE (suspendida / borrada)
//   C5  D1 F, D2a F, D3 F                      -> 200, la cuenta queda activa
// Con C1..C5 cada rama de D1, D2 (incluidos los dos operandos del &&) y D3 toma los valores
// verdadero y falso, es decir, 100 % de cobertura de ramas.
// C5b agrega el camino en que consume() rechaza el código: no es una rama de verifyEmail, pero
// comprueba que la cuenta no se modifique ni se guarde si el código es inválido.

const EMAIL = 'alumno@aloe.ulima.edu.pe';
const CODE = '123456';

function buildUser(status: UserAccountStatus, isVerified: boolean): UserEntity {
  return Object.assign(new UserEntity(), {
    id: 'user-1',
    email: EMAIL,
    name: 'Alumno Prueba',
    status,
    isVerified,
    verificationToken: CODE,
    verificationTokenExpiresAt: new Date(Date.now() + 60_000),
  });
}

describe('AccountVerificationService.verifyEmail (caja blanca)', () => {
  let service: AccountVerificationServiceImpl;
  let users: Mocked<UsersRepository>;
  let oneTimeCodes: Mocked<OneTimeCodeService>;
  let mailSender: Mocked<MailSender>;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      save: vi.fn().mockImplementation(async (user: UserEntity) => user),
    } as unknown as Mocked<UsersRepository>;
    oneTimeCodes = {
      issue: vi.fn(),
      consume: vi.fn(),
    } as unknown as Mocked<OneTimeCodeService>;
    mailSender = {
      sendVerificationCode: vi.fn(),
      sendPasswordResetCode: vi.fn(),
    } as unknown as Mocked<MailSender>;

    service = new AccountVerificationServiceImpl(users, oneTimeCodes, mailSender);
  });

  // Comprueba que verifyEmail termine en la salida de error esperada sin tocar la cuenta
  async function expectRejectedWithoutChanges(message: string): Promise<void> {
    const result = service.verifyEmail({ email: EMAIL, token: CODE });
    await expect(result).rejects.toThrow(new AuthException(message));
    await expect(result).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(oneTimeCodes.consume).not.toHaveBeenCalled();
    expect(users.save).not.toHaveBeenCalled();
  }

  it('C1 · D1 verdadera: el correo no está registrado', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expectRejectedWithoutChanges(AUTH_MESSAGES.INVALID_CODE);
    expect(users.findByEmail).toHaveBeenCalledWith(EMAIL);
  });

  it('C2 · D2 verdadera (D2a V, D2b V): la cuenta ya está activa y verificada', async () => {
    users.findByEmail.mockResolvedValue(buildUser(UserAccountStatus.ACTIVE, true));

    await expectRejectedWithoutChanges(AUTH_MESSAGES.ALREADY_VERIFIED);
  });

  it('C3 · D2 falsa por D2b y D3 verdadera: cuenta activa pero sin verificar', async () => {
    users.findByEmail.mockResolvedValue(buildUser(UserAccountStatus.ACTIVE, false));

    await expectRejectedWithoutChanges(AUTH_MESSAGES.INVALID_CODE);
  });

  it.each([UserAccountStatus.SUSPENDED, UserAccountStatus.DELETED])(
    'C4 · D2 falsa por cortocircuito (D2a F) y D3 verdadera: cuenta %s',
    async (status) => {
      // isVerified = true demuestra que D2b no se evalúa cuando el estado no es ACTIVE
      users.findByEmail.mockResolvedValue(buildUser(status, true));

      await expectRejectedWithoutChanges(AUTH_MESSAGES.INVALID_CODE);
    },
  );

  it('C5 · D3 falsa: cuenta pendiente con código válido queda activa y verificada', async () => {
    const user = buildUser(UserAccountStatus.PENDING_VERIFICATION, false);
    users.findByEmail.mockResolvedValue(user);

    const result = await service.verifyEmail({ email: EMAIL, token: CODE });

    expect(result).toEqual({ message: AUTH_MESSAGES.EMAIL_VERIFIED, isVerified: true });
    expect(oneTimeCodes.consume).toHaveBeenCalledWith(
      user,
      OneTimeCodePurpose.EMAIL_VERIFICATION,
      CODE,
    );
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserAccountStatus.ACTIVE, isVerified: true }),
    );
    // El código se consume antes de activar y guardar la cuenta
    expect(oneTimeCodes.consume.mock.invocationCallOrder[0]).toBeLessThan(
      users.save.mock.invocationCallOrder[0],
    );
    expect(mailSender.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('C5b · D3 falsa con código rechazado por consume(): la cuenta no cambia ni se guarda', async () => {
    const user = buildUser(UserAccountStatus.PENDING_VERIFICATION, false);
    users.findByEmail.mockResolvedValue(user);
    oneTimeCodes.consume.mockImplementation(() => {
      throw new AuthException(AUTH_MESSAGES.INVALID_CODE);
    });

    const result = service.verifyEmail({ email: EMAIL, token: '000000' });

    await expect(result).rejects.toThrow(new AuthException(AUTH_MESSAGES.INVALID_CODE));
    expect(user.status).toBe(UserAccountStatus.PENDING_VERIFICATION);
    expect(user.isVerified).toBe(false);
    expect(users.save).not.toHaveBeenCalled();
  });
});
