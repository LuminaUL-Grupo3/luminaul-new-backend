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

// Pruebas unitarias del servicio AccountVerificationServiceImpl (HU 3.3, verificar cuenta por correo).
//
// Métodos públicos y casos:
//   verifyEmail  éxito: cuenta pendiente con código válido queda activa y verificada.
//                error: correo no registrado, cuenta ya verificada, cuenta en otro estado,
//                       código rechazado y fallo al guardar.
//   resendCode   éxito: cuenta pendiente recibe un código nuevo.
//                error: correo no registrado o cuenta no pendiente (no se envía nada y se responde
//                       igual), fallo al guardar y fallo al enviar el correo.
//
// Las tres dependencias son abstracciones (UsersRepository, OneTimeCodeService, MailSender) y se
// reemplazan por dobles de prueba: ninguna prueba usa PostgreSQL, SMTP ni otro servicio externo.

const EMAIL = '20260001@aloe.ulima.edu.pe';
const NAME = 'Alumno Prueba';
const CODE = '482913';
const NEW_CODE = '730154';
const EXPIRES_AT = new Date('2026-11-17T15:15:00.000Z');

function buildUser(status: UserAccountStatus, isVerified: boolean): UserEntity {
  return Object.assign(new UserEntity(), {
    id: 'user-1',
    email: EMAIL,
    name: NAME,
    status,
    isVerified,
    verificationToken: CODE,
    verificationTokenExpiresAt: EXPIRES_AT,
  });
}

describe('AccountVerificationService (unitaria)', () => {
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
      issue: vi.fn().mockReturnValue({ code: NEW_CODE, expiresAt: EXPIRES_AT }),
      consume: vi.fn(),
    } as unknown as Mocked<OneTimeCodeService>;
    mailSender = {
      sendVerificationCode: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetCode: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<MailSender>;

    service = new AccountVerificationServiceImpl(users, oneTimeCodes, mailSender);
  });

  describe('verifyEmail', () => {
    async function expectRejected(message: string): Promise<void> {
      const result = service.verifyEmail({ email: EMAIL, token: CODE });
      await expect(result).rejects.toThrow(new AuthException(message));
      await expect(result).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(oneTimeCodes.consume).not.toHaveBeenCalled();
      expect(users.save).not.toHaveBeenCalled();
    }

    it('éxito · cuenta pendiente con código válido: queda activa y verificada', async () => {
      const user = buildUser(UserAccountStatus.PENDING_VERIFICATION, false);
      users.findByEmail.mockResolvedValue(user);

      const result = await service.verifyEmail({ email: EMAIL, token: CODE });

      expect(result).toEqual({ message: AUTH_MESSAGES.EMAIL_VERIFIED, isVerified: true });
      expect(users.findByEmail).toHaveBeenCalledWith(EMAIL);
      expect(oneTimeCodes.consume).toHaveBeenCalledWith(user, OneTimeCodePurpose.EMAIL_VERIFICATION, CODE);
      expect(users.save).toHaveBeenCalledTimes(1);
      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserAccountStatus.ACTIVE, isVerified: true }),
      );
      // Primero se valida y consume el código; después se guarda la cuenta activa
      expect(oneTimeCodes.consume.mock.invocationCallOrder[0]).toBeLessThan(
        users.save.mock.invocationCallOrder[0],
      );
      expect(mailSender.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('error · correo no registrado: 400 INVALID_CODE', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expectRejected(AUTH_MESSAGES.INVALID_CODE);
    });

    it('error · cuenta ya verificada: 400 ALREADY_VERIFIED', async () => {
      users.findByEmail.mockResolvedValue(buildUser(UserAccountStatus.ACTIVE, true));

      await expectRejected(AUTH_MESSAGES.ALREADY_VERIFIED);
    });

    it.each([
      ['suspendida', UserAccountStatus.SUSPENDED, true],
      ['borrada', UserAccountStatus.DELETED, true],
      ['activa sin verificar', UserAccountStatus.ACTIVE, false],
    ])('error · cuenta %s: 400 INVALID_CODE y no se reactiva', async (_case, status, isVerified) => {
      const user = buildUser(status, isVerified);
      users.findByEmail.mockResolvedValue(user);

      await expectRejected(AUTH_MESSAGES.INVALID_CODE);
      expect(user.status).toBe(status);
    });

    it('error · código incorrecto o vencido: se propaga el 400 y la cuenta no cambia', async () => {
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

    it('error · falla el guardado: el error se propaga y no se responde como verificada', async () => {
      users.findByEmail.mockResolvedValue(buildUser(UserAccountStatus.PENDING_VERIFICATION, false));
      const failure = new Error('conexión perdida');
      users.save.mockRejectedValue(failure);

      await expect(service.verifyEmail({ email: EMAIL, token: CODE })).rejects.toBe(failure);
    });
  });

  describe('resendCode', () => {
    it('éxito · cuenta pendiente: emite un código nuevo, lo guarda y lo envía', async () => {
      const user = buildUser(UserAccountStatus.PENDING_VERIFICATION, false);
      users.findByEmail.mockResolvedValue(user);

      const result = await service.resendCode({ email: EMAIL });

      expect(result).toEqual({ message: AUTH_MESSAGES.CODE_RESENT });
      expect(users.findByEmail).toHaveBeenCalledWith(EMAIL);
      expect(oneTimeCodes.issue).toHaveBeenCalledWith(user, OneTimeCodePurpose.EMAIL_VERIFICATION);
      expect(users.save).toHaveBeenCalledWith(user);
      expect(mailSender.sendVerificationCode).toHaveBeenCalledWith({
        to: EMAIL,
        name: NAME,
        code: NEW_CODE,
        expiresAt: EXPIRES_AT,
      });
      // El código se guarda antes de enviarlo: nunca llega un código que no esté en la base
      expect(oneTimeCodes.issue.mock.invocationCallOrder[0]).toBeLessThan(
        users.save.mock.invocationCallOrder[0],
      );
      expect(users.save.mock.invocationCallOrder[0]).toBeLessThan(
        mailSender.sendVerificationCode.mock.invocationCallOrder[0],
      );
      expect(mailSender.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it.each([
      ['correo no registrado', null],
      ['cuenta ya verificada', buildUser(UserAccountStatus.ACTIVE, true)],
      ['cuenta suspendida', buildUser(UserAccountStatus.SUSPENDED, true)],
      ['cuenta borrada', buildUser(UserAccountStatus.DELETED, true)],
    ])('error · %s: no emite ni envía código', async (_case, user) => {
      users.findByEmail.mockResolvedValue(user);

      const result = await service.resendCode({ email: EMAIL });

      // Misma respuesta que en el caso exitoso, para no revelar qué correos están registrados
      expect(result).toEqual({ message: AUTH_MESSAGES.CODE_RESENT });
      expect(oneTimeCodes.issue).not.toHaveBeenCalled();
      expect(users.save).not.toHaveBeenCalled();
      expect(mailSender.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('error · falla el guardado: el error se propaga y no se envía un código sin guardar', async () => {
      users.findByEmail.mockResolvedValue(buildUser(UserAccountStatus.PENDING_VERIFICATION, false));
      const failure = new Error('conexión perdida');
      users.save.mockRejectedValue(failure);

      await expect(service.resendCode({ email: EMAIL })).rejects.toBe(failure);
      expect(mailSender.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('error · falla el envío del correo: el error se propaga', async () => {
      users.findByEmail.mockResolvedValue(buildUser(UserAccountStatus.PENDING_VERIFICATION, false));
      const failure = new Error('SMTP no disponible');
      mailSender.sendVerificationCode.mockRejectedValue(failure);

      await expect(service.resendCode({ email: EMAIL })).rejects.toBe(failure);
      // El código nuevo ya quedó guardado: el usuario puede pedir otro reenvío
      expect(users.save).toHaveBeenCalledTimes(1);
    });
  });
});
