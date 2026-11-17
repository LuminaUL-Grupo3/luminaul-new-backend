import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX, configureHttpApp } from '../../../config/http-app.config';
import { AuthController } from '../controller/AuthController';
import { AuthService } from '../service/AuthService';
import { AuthServiceImpl } from '../service/impl/AuthServiceImpl';
import { AccountVerificationService } from '../service/AccountVerificationService';
import { AccountVerificationServiceImpl } from '../service/impl/AccountVerificationServiceImpl';
import { OneTimeCodeService } from '../service/OneTimeCodeService';
import { OneTimeCodeServiceImpl } from '../service/impl/OneTimeCodeServiceImpl';
import { SessionService } from '../service/SessionService';
import { PasswordService } from '../service/PasswordService';
import { UsersRepository } from '../repository/UsersRepository';
import { PasswordHasher } from '../strategy/PasswordHasher';
import { BcryptPasswordHasher } from '../strategy/impl/BcryptPasswordHasher';
import { OtpGenerator } from '../strategy/OtpGenerator';
import { RandomOtpGenerator } from '../strategy/impl/RandomOtpGenerator';
import { CodeMail, MailSender } from '../mail/MailSender';
import { UserEntity } from '../entities/user.entity';
import { UserAccountStatus } from '../enums/UserAccountStatus';
import { AUTH_LIMITS, AUTH_MESSAGES, AUTH_VALIDATION_MESSAGES } from '../auth.constants';

// Prueba de caja negra de "Verificar cuenta" (POST /api/auth/verify-email).
//
// Se diseña solo a partir de la especificación pública del endpoint, sin mirar su código:
//   - Entrada: { email, token }. token = código OTP de 6 dígitos que llega por correo.
//   - El código vence a los 15 minutos y es de un solo uso.
//   - 200 { message: EMAIL_VERIFIED, isVerified: true } si la cuenta pendiente queda verificada.
//   - 400 con el mensaje de validación si la petición está mal formada.
//   - 400 INVALID_CODE si el código es incorrecto o venció, o si no se puede verificar la cuenta;
//     400 ALREADY_VERIFIED si la cuenta ya estaba verificada.
//
// La API se levanta con configureHttpApp (mismo prefijo, ValidationPipe y filtro de errores que
// main.ts) y se usa solo por HTTP. Las precondiciones se crean por la API pública: la cuenta se
// registra con POST /api/auth/register y el código se lee del correo que se habría enviado.
// La base de datos se reemplaza por un repositorio en memoria; los estados que la API de auth no
// permite alcanzar (suspendida, borrada) se fijan en ese repositorio, como lo haría moderación.
//
// Técnicas: particiones de equivalencia (EV = válida, EI = inválida), valores límite (BV) y
// tabla de decisión del estado de la cuenta (TD).

// Base de datos en memoria con el mismo contrato que UsersRepositoryImpl
class InMemoryUsersRepository extends UsersRepository {
  private readonly rows = new Map<string, UserEntity>();

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.rows.get(email) ?? null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    return [...this.rows.values()].find((user) => user.id === id) ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.rows.has(email);
  }

  build(data: Partial<UserEntity>): UserEntity {
    return Object.assign(new UserEntity(), data);
  }

  async save(user: UserEntity): Promise<UserEntity> {
    this.rows.set(user.email, user);
    return user;
  }

  async update(id: string, changes: Partial<UserEntity>): Promise<void> {
    const user = await this.findById(id);
    if (user) Object.assign(user, changes);
  }

  async createWithProfile(user: UserEntity): Promise<UserEntity> {
    Object.assign(user, { id: randomUUID(), tokensValidAfter: new Date(), deletedAt: null });
    return this.save(user);
  }

  // Cambio de estado hecho por otro módulo (p. ej. moderación suspende la cuenta)
  setStatus(email: string, status: UserAccountStatus): void {
    const user = this.rows.get(email);
    if (!user) throw new Error(`No existe la cuenta ${email}`);
    user.status = status;
  }

  clear(): void {
    this.rows.clear();
  }
}

// Bandeja de entrada: guarda los correos de verificación que la API manda
class InboxMailSender extends MailSender {
  readonly sent: CodeMail[] = [];

  async sendVerificationCode(mail: CodeMail): Promise<void> {
    this.sent.push(mail);
  }

  async sendPasswordResetCode(mail: CodeMail): Promise<void> {
    this.sent.push(mail);
  }

  lastCodeFor(email: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === email);
    if (!mail) throw new Error(`No llegó ningún correo a ${email}`);
    return mail.code;
  }
}

const users = new InMemoryUsersRepository();
const inbox = new InboxMailSender();

@Module({
  controllers: [AuthController],
  providers: [
    { provide: UsersRepository, useValue: users },
    { provide: MailSender, useValue: inbox },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: OtpGenerator, useClass: RandomOtpGenerator },
    { provide: OneTimeCodeService, useClass: OneTimeCodeServiceImpl },
    { provide: AccountVerificationService, useClass: AccountVerificationServiceImpl },
    { provide: AuthService, useClass: AuthServiceImpl },
    // Verificar cuenta no usa sesiones ni contraseñas; el controller igual los necesita
    { provide: SessionService, useValue: {} },
    { provide: PasswordService, useValue: {} },
  ],
})
class VerifyEmailTestModule {}

interface ApiResponse {
  status: number;
  body: { statusCode?: number; message?: string | string[]; isVerified?: boolean };
}

const OTP_TTL_MS = AUTH_LIMITS.OTP_TTL_MINUTES * 60_000;
const PASSWORD = 'ClaveSegura123!';

describe('Verificar cuenta · POST /api/auth/verify-email (caja negra)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let sequence = 0;

  beforeAll(async () => {
    app = await NestFactory.create(VerifyEmailTestModule, { logger: false });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/${API_PREFIX}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    users.clear();
    inbox.sent.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function post(path: string, body: unknown): Promise<ApiResponse> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  function verify(body: unknown): Promise<ApiResponse> {
    return post('/auth/verify-email', body);
  }

  // Precondición: cuenta recién registrada (pendiente) y el código que le llegó por correo
  async function registerAccount(): Promise<{ email: string; code: string }> {
    sequence += 1;
    const email = `2026${String(sequence).padStart(4, '0')}@aloe.ulima.edu.pe`;
    const res = await post('/auth/register', { email, password: PASSWORD, name: 'Alumno Prueba' });
    expect(res.status).toBe(201);
    return { email, code: inbox.lastCodeFor(email) };
  }

  // Otro código válido de 6 dígitos, distinto del que se envió
  function otherCode(code: string): string {
    return String((Number(code) + 1) % 10 ** AUTH_LIMITS.OTP_LENGTH).padStart(
      AUTH_LIMITS.OTP_LENGTH,
      '0',
    );
  }

  function expectVerified(res: ApiResponse): void {
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: AUTH_MESSAGES.EMAIL_VERIFIED, isVerified: true });
  }

  function expectRejected(res: ApiResponse, message: string): void {
    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    // ValidationPipe responde una lista de mensajes; las reglas de negocio, uno solo
    if (Array.isArray(res.body.message)) expect(res.body.message).toContain(message);
    else expect(res.body.message).toBe(message);
  }

  describe('Particiones de equivalencia del campo email', () => {
    it('EV1 · correo de una cuenta pendiente con su código: la verifica', async () => {
      const { email, code } = await registerAccount();
      expectVerified(await verify({ email, token: code }));
    });

    it('EV2 · el mismo correo en mayúsculas y con espacios se normaliza y se acepta', async () => {
      const { email, code } = await registerAccount();
      expectVerified(await verify({ email: `  ${email.toUpperCase()}  `, token: code }));
    });

    it('EV3 · correo con formato válido pero no registrado: código inválido', async () => {
      const res = await verify({ email: 'nadie@aloe.ulima.edu.pe', token: '123456' });
      expectRejected(res, AUTH_MESSAGES.INVALID_CODE);
    });

    it.each([
      ['EI1 · campo ausente', undefined],
      ['EI2 · cadena vacía', ''],
      ['EI3 · sin @ ni dominio', 'alumno'],
      ['EI4 · sin dominio', 'alumno@'],
      ['EI5 · tipo no texto', 20260001],
    ])('%s: 400 por formato de correo', async (_case, email) => {
      const res = await verify({ email, token: '123456' });
      expectRejected(res, AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT);
    });
  });

  describe('Particiones de equivalencia y valores límite del campo token', () => {
    it('BV · 6 dígitos (longitud exacta) con el código correcto: la verifica', async () => {
      const { email, code } = await registerAccount();
      expectVerified(await verify({ email, token: code }));
    });

    it.each([
      ['BV · 5 dígitos (límite inferior - 1)', '12345'],
      ['BV · 7 dígitos (límite superior + 1)', '1234567'],
      ['EI · cadena vacía', ''],
      ['EI · campo ausente', undefined],
    ])('%s: 400 por longitud del código', async (_case, token) => {
      const { email } = await registerAccount();
      expectRejected(await verify({ email, token }), AUTH_VALIDATION_MESSAGES.OTP_LENGTH);
    });

    it.each([
      ['EI · letras', 'abcdef'],
      ['EI · dígitos con una letra', '12a456'],
      ['EI · dígitos con signo', '-12345'],
    ])('%s (6 caracteres): 400 porque solo admite números', async (_case, token) => {
      const { email } = await registerAccount();
      expectRejected(await verify({ email, token }), AUTH_VALIDATION_MESSAGES.OTP_DIGITS);
    });

    it('EV · el código correcto con espacios alrededor se acepta', async () => {
      const { email, code } = await registerAccount();
      expectVerified(await verify({ email, token: `  ${code}  ` }));
    });

    it('EI · 6 dígitos que no son el código enviado: código inválido', async () => {
      const { email, code } = await registerAccount();
      expectRejected(await verify({ email, token: otherCode(code) }), AUTH_MESSAGES.INVALID_CODE);
    });
  });

  describe('Valores límite de la vigencia del código (15 minutos)', () => {
    const T0 = new Date('2026-11-12T15:00:00.000Z');

    it.each([
      ['15 min - 1 ms después del envío (último instante vigente)', OTP_TTL_MS - 1, 200],
      ['15 min exactos después del envío (ya vencido)', OTP_TTL_MS, 400],
      ['15 min + 1 ms después del envío', OTP_TTL_MS + 1, 400],
    ])('BV · %s', async (_case, elapsedMs, expectedStatus) => {
      // Solo se controla el reloj (Date); los temporizadores de HTTP siguen siendo reales
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(T0);
      const { email, code } = await registerAccount();

      vi.setSystemTime(T0.getTime() + elapsedMs);
      const res = await verify({ email, token: code });

      if (expectedStatus === 200) expectVerified(res);
      else expectRejected(res, AUTH_MESSAGES.INVALID_CODE);
    });
  });

  describe('Tabla de decisión: estado de la cuenta × código', () => {
    // Condiciones: C1 cuenta registrada · C2 estado · C3 código correcto y vigente
    //  R1  sí · pendiente               · sí -> 200 verificada
    //  R2  sí · pendiente               · no -> 400 INVALID_CODE
    //  R3  sí · activa (ya verificada)  · sí -> 400 ALREADY_VERIFIED
    //  R4  sí · suspendida              · sí -> 400 INVALID_CODE
    //  R5  sí · borrada                 · sí -> 400 INVALID_CODE
    //  R6  no · —                       · — -> 400 INVALID_CODE (EV3)

    it('R1 · pendiente + código correcto: 200 y la cuenta deja de estar pendiente', async () => {
      const { email, code } = await registerAccount();
      expectVerified(await verify({ email, token: code }));
      // Efecto observable: una segunda verificación ya la encuentra verificada
      expectRejected(await verify({ email, token: code }), AUTH_MESSAGES.ALREADY_VERIFIED);
    });

    it('R2 · pendiente + código incorrecto: 400 y la cuenta sigue pendiente', async () => {
      const { email, code } = await registerAccount();
      expectRejected(await verify({ email, token: otherCode(code) }), AUTH_MESSAGES.INVALID_CODE);
      // Sigue pendiente: el código correcto todavía la verifica
      expectVerified(await verify({ email, token: code }));
    });

    it('R3 · cuenta ya verificada: 400 ALREADY_VERIFIED', async () => {
      const { email, code } = await registerAccount();
      expectVerified(await verify({ email, token: code }));
      const res = await verify({ email, token: otherCode(code) });
      expectRejected(res, AUTH_MESSAGES.ALREADY_VERIFIED);
    });

    it.each([
      ['R4 · suspendida', UserAccountStatus.SUSPENDED],
      ['R5 · borrada', UserAccountStatus.DELETED],
    ])('%s + código correcto: 400 INVALID_CODE (no se reactiva)', async (_case, status) => {
      const { email, code } = await registerAccount();
      users.setStatus(email, status);
      expectRejected(await verify({ email, token: code }), AUTH_MESSAGES.INVALID_CODE);
    });

    it('Código de un solo uso: tras un reenvío solo sirve el código más reciente', async () => {
      const { email, code: first } = await registerAccount();
      expect((await post('/auth/resend-code', { email })).status).toBe(200);
      const second = inbox.lastCodeFor(email);

      if (first !== second) {
        expectRejected(await verify({ email, token: first }), AUTH_MESSAGES.INVALID_CODE);
      }
      expectVerified(await verify({ email, token: second }));
    });
  });

  describe('Forma de la petición', () => {
    it('EI · un campo adicional no previsto: 400', async () => {
      const { email, code } = await registerAccount();
      const res = await verify({ email, token: code, isVerified: true });
      expectRejected(res, 'property isVerified should not exist');
    });

    it('EI · cuerpo vacío: 400 con los errores de ambos campos', async () => {
      const res = await verify({});
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          AUTH_VALIDATION_MESSAGES.EMAIL_FORMAT,
          AUTH_VALIDATION_MESSAGES.OTP_LENGTH,
        ]),
      );
    });
  });
});
