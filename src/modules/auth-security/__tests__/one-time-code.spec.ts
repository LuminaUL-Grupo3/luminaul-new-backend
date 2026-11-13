import { HttpStatus } from '@nestjs/common';
import { OneTimeCodeServiceImpl } from '../service/impl/OneTimeCodeServiceImpl';
import { OtpGenerator } from '../strategy/OtpGenerator';
import { UserEntity } from '../entities/user.entity';
import { OneTimeCodePurpose } from '../enums/OneTimeCodePurpose';
import { AuthException } from '../exception/AuthException';
import { AUTH_MESSAGES } from '../auth.constants';

// Prueba unitaria de caja blanca de OneTimeCodeServiceImpl.consume (CC = 5) y de safeEquals (CC = 2).
//
// Decisiones:
//   valid = A && B && C && D
//     A  stored !== null
//     B  expiresAt !== null
//     C  expiresAt.getTime() > Date.now()
//     D  safeEquals(stored, code) = E && F
//          E  left.length === right.length
//          F  timingSafeEqual(left, right)          (solo se evalúa si E es verdadera)
//   G  if (!valid)
//
// Caminos (uno por caso) y valor que toma cada condición:
//   C1  A F                                   -> 400 (no hay código emitido)
//   C2  A V, B F                              -> 400 (código sin vencimiento)
//   C3  A V, B V, C F                         -> 400 (vencido; incluye el límite expiresAt === ahora)
//   C4a A V, B V, C V, E F                    -> 400 (longitud distinta; timingSafeEqual no se llama)
//   C4b A V, B V, C V, E V, F F               -> 400 (misma longitud, otro contenido)
//   C5  A V, B V, C V, E V, F V  (G F)        -> válido: el código se borra (un solo uso)
// C1..C4b hacen G verdadera; C5 la hace falsa. Cada operando de los dos && toma los valores
// verdadero y falso, es decir, 100 % de cobertura de ramas de consume y de safeEquals.
// Los casos finales comprueban que cada propósito usa sus propias columnas.

const NOW = new Date('2026-11-12T15:00:00.000Z');
const CODE = '123456';
const IN_ONE_MINUTE = new Date(NOW.getTime() + 60_000);

const VERIFICATION = OneTimeCodePurpose.EMAIL_VERIFICATION;
const RESET = OneTimeCodePurpose.PASSWORD_RESET;

interface CodeState {
  verificationToken: string | null;
  verificationTokenExpiresAt: Date | null;
  resetToken: string | null;
  resetTokenExpiresAt: Date | null;
}

function buildUser(state: Partial<CodeState> = {}): UserEntity {
  return Object.assign(new UserEntity(), {
    id: 'user-1',
    verificationToken: null,
    verificationTokenExpiresAt: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    ...state,
  });
}

function codeState(user: UserEntity): CodeState {
  return {
    verificationToken: user.verificationToken,
    verificationTokenExpiresAt: user.verificationTokenExpiresAt,
    resetToken: user.resetToken,
    resetTokenExpiresAt: user.resetTokenExpiresAt,
  };
}

describe('OneTimeCodeService.consume (caja blanca)', () => {
  let service: OneTimeCodeServiceImpl;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // consume no genera códigos: el generador no debe usarse
    const otpGenerator: OtpGenerator = { generate: vi.fn() };
    service = new OneTimeCodeServiceImpl(otpGenerator);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Comprueba la salida G verdadera: 400 INVALID_CODE y la entidad sin cambios, para que el
  // usuario pueda reintentar con el código correcto
  function expectRejectedWithoutChanges(
    user: UserEntity,
    code: string,
    purpose: OneTimeCodePurpose = VERIFICATION,
  ): void {
    const before = codeState(user);
    let thrown: unknown;
    try {
      service.consume(user, purpose, code);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AuthException);
    expect(thrown).toMatchObject({ message: AUTH_MESSAGES.INVALID_CODE, status: HttpStatus.BAD_REQUEST });
    expect(codeState(user)).toEqual(before);
  }

  it('C1 · A falsa: no hay código emitido', () => {
    const user = buildUser({ verificationToken: null, verificationTokenExpiresAt: IN_ONE_MINUTE });

    expectRejectedWithoutChanges(user, CODE);
  });

  it('C2 · A verdadera, B falsa: el código no tiene fecha de vencimiento', () => {
    const user = buildUser({ verificationToken: CODE, verificationTokenExpiresAt: null });

    expectRejectedWithoutChanges(user, CODE);
  });

  it.each([
    ['vence exactamente ahora (límite)', 0],
    ['venció hace 1 ms', -1],
    ['venció hace 15 minutos', -15 * 60_000],
  ])('C3 · C falsa: el código %s', (_case, offsetMs) => {
    const user = buildUser({
      verificationToken: CODE,
      verificationTokenExpiresAt: new Date(NOW.getTime() + offsetMs),
    });

    expectRejectedWithoutChanges(user, CODE);
  });

  it.each([
    ['5 dígitos', '12345'],
    ['7 dígitos', '1234567'],
    ['código vacío', ''],
    ['6 caracteres pero 7 bytes (la ñ ocupa dos)', '12345ñ'],
  ])('C4a · E falsa, longitud distinta a la del código guardado: %s', (_case, sent) => {
    // timingSafeEqual lanza RangeError con buffers de distinto largo: recibir AuthException
    // demuestra que E corta la evaluación antes de llamarlo
    const user = buildUser({ verificationToken: CODE, verificationTokenExpiresAt: IN_ONE_MINUTE });

    expectRejectedWithoutChanges(user, sent);
  });

  it.each([
    ['todos los dígitos distintos', '654321'],
    ['solo el último dígito distinto', '123457'],
    ['solo el primer dígito distinto', '023456'],
  ])('C4b · E verdadera, F falsa: %s', (_case, sent) => {
    const user = buildUser({ verificationToken: CODE, verificationTokenExpiresAt: IN_ONE_MINUTE });

    expectRejectedWithoutChanges(user, sent);
  });

  it('C5 · G falsa: código correcto y vigente se acepta y se borra', () => {
    // 1 ms antes del vencimiento: el valor más cercano al límite que todavía es válido
    const user = buildUser({
      verificationToken: CODE,
      verificationTokenExpiresAt: new Date(NOW.getTime() + 1),
    });

    expect(service.consume(user, VERIFICATION, CODE)).toBeUndefined();
    expect(user.verificationToken).toBeNull();
    expect(user.verificationTokenExpiresAt).toBeNull();
  });

  it('C5 → C1 · el código es de un solo uso: el segundo intento se rechaza', () => {
    const user = buildUser({ verificationToken: CODE, verificationTokenExpiresAt: IN_ONE_MINUTE });

    service.consume(user, VERIFICATION, CODE);

    expectRejectedWithoutChanges(user, CODE);
  });

  describe('columnas por propósito', () => {
    it.each([
      [VERIFICATION, 'verificationToken', 'verificationTokenExpiresAt', 'resetToken', 'resetTokenExpiresAt'],
      [RESET, 'resetToken', 'resetTokenExpiresAt', 'verificationToken', 'verificationTokenExpiresAt'],
    ] as const)(
      '%s: borra solo sus columnas y deja intacto el otro código',
      (purpose, ownCode, ownExpiry, otherCode, otherExpiry) => {
        const user = buildUser({
          verificationToken: CODE,
          verificationTokenExpiresAt: IN_ONE_MINUTE,
          resetToken: CODE,
          resetTokenExpiresAt: IN_ONE_MINUTE,
        });

        service.consume(user, purpose, CODE);

        expect(user[ownCode]).toBeNull();
        expect(user[ownExpiry]).toBeNull();
        expect(user[otherCode]).toBe(CODE);
        expect(user[otherExpiry]).toEqual(IN_ONE_MINUTE);
      },
    );

    it.each([
      ['un código de verificación no sirve para restablecer la contraseña', RESET, { verificationToken: CODE, verificationTokenExpiresAt: IN_ONE_MINUTE }],
      ['un código de restablecimiento no sirve para verificar la cuenta', VERIFICATION, { resetToken: CODE, resetTokenExpiresAt: IN_ONE_MINUTE }],
    ] as const)('%s', (_case, purpose, state) => {
      expectRejectedWithoutChanges(buildUser(state), CODE, purpose);
    });
  });
});
