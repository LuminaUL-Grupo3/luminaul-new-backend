import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { validateEnv } from '../../../config/env.validation';
import { loadMailConfig } from '../config/mail.config';
import { renderPasswordResetMail, renderVerificationCodeMail } from '../providers/mail-templates';
import { SmtpMailSender } from '../providers/smtp-mail-sender';
import { createMailTransport } from '../providers/mail-transport.factory';
import { ConsoleMailSender, CodeMail } from '../providers/mail-sender';

const SMTP_ENV = {
  MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.ejemplo.com',
  SMTP_USER: 'remitente@ejemplo.com',
  SMTP_PASSWORD: 'secreto',
  MAIL_FROM: 'LuminaUL <remitente@ejemplo.com>',
};

const reader = (env: Record<string, string>) => (key: string) => env[key];

const sampleMail: CodeMail = {
  to: '20210001@aloe.ulima.edu.pe',
  name: 'Martín Vizcarra',
  code: '492018',
  expiresAt: new Date('2026-11-06T20:15:00Z'),
};

describe('loadMailConfig', () => {
  it('usa consola por defecto cuando no hay variables', () => {
    expect(loadMailConfig(reader({}))).toEqual({ transport: 'console' });
  });

  it('con MAIL_TRANSPORT=smtp exige host, usuario, contraseña y remitente', () => {
    expect(() => loadMailConfig(reader({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.x.com' }))).toThrow(
      'MAIL_TRANSPORT=smtp requiere: SMTP_USER, SMTP_PASSWORD, MAIL_FROM',
    );
  });

  it('trata las variables vacías como ausentes', () => {
    expect(() => loadMailConfig(reader({ ...SMTP_ENV, SMTP_PASSWORD: '' }))).toThrow('SMTP_PASSWORD');
  });

  it('deduce el cifrado del puerto: 587 STARTTLS, 465 TLS directo', () => {
    const starttls = loadMailConfig(reader(SMTP_ENV));
    const tls = loadMailConfig(reader({ ...SMTP_ENV, SMTP_PORT: '465' }));
    expect(starttls).toMatchObject({ transport: 'smtp', smtp: { port: 587, secure: false } });
    expect(tls).toMatchObject({ transport: 'smtp', smtp: { port: 465, secure: true } });
  });

  it('respeta SMTP_SECURE explícito', () => {
    const config = loadMailConfig(reader({ ...SMTP_ENV, SMTP_PORT: '2525', SMTP_SECURE: 'true' }));
    expect(config).toMatchObject({ smtp: { port: 2525, secure: true } });
  });

  it('rechaza valores inválidos', () => {
    expect(() => loadMailConfig(reader({ MAIL_TRANSPORT: 'sendgrid' }))).toThrow('[Mail Config]');
    expect(() => loadMailConfig(reader({ ...SMTP_ENV, SMTP_PORT: 'abc' }))).toThrow('[Mail Config]');
  });
});

describe('plantillas de correo', () => {
  it('incluyen el código en texto y HTML, con su vencimiento en hora de Lima', () => {
    const mail = renderVerificationCodeMail(sampleMail);
    expect(mail.subject).toBe('Verifica tu cuenta de LuminaUL');
    expect(mail.text).toContain('492018');
    expect(mail.html).toContain('492018');
    expect(mail.text).toContain('(hora de Lima)');
  });

  it('el correo de recuperación tiene su propio asunto', () => {
    expect(renderPasswordResetMail(sampleMail).subject).toBe('Restablece tu contraseña de LuminaUL');
  });

  it('escapa el nombre del usuario en el HTML', () => {
    const mail = renderVerificationCodeMail({ ...sampleMail, name: '<img src=x onerror=alert(1)>' });
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('SmtpMailSender', () => {
  // jsonTransport: transporte en memoria de nodemailer, arma el mensaje completo sin red
  const buildSender = () => {
    const transporter = createTransport({ jsonTransport: true });
    const sendMail = jest.spyOn(transporter, 'sendMail');
    return { sender: new SmtpMailSender(transporter, SMTP_ENV.MAIL_FROM), transporter, sendMail };
  };

  it('envía el código de verificación al destinatario con el remitente configurado', async () => {
    const { sender, sendMail } = buildSender();
    await sender.sendVerificationCode(sampleMail);

    const [message] = sendMail.mock.calls[0];
    expect(message).toMatchObject({
      from: SMTP_ENV.MAIL_FROM,
      to: sampleMail.to,
      subject: 'Verifica tu cuenta de LuminaUL',
    });
    expect(message.text).toContain('492018');
    expect(message.headers).toEqual({ 'Auto-Submitted': 'auto-generated' });
    // nodemailer llegó a construir el mensaje MIME completo
    await expect(sendMail.mock.results[0].value).resolves.toHaveProperty('message');
  });

  it('envía el código de recuperación', async () => {
    const { sender, sendMail } = buildSender();
    await sender.sendPasswordResetCode(sampleMail);
    expect(sendMail.mock.calls[0][0].subject).toBe('Restablece tu contraseña de LuminaUL');
  });

  it('propaga el error del SMTP para que NonBlockingMailSender lo registre', async () => {
    const { sender, sendMail } = buildSender();
    // sendMail está sobrecargado (promesa o callback); el cast evita que Jest infiera `never`
    (sendMail as unknown as jest.Mock).mockRejectedValueOnce(new Error('535 Authentication failed'));
    await expect(sender.sendVerificationCode(sampleMail)).rejects.toThrow('535');
  });

  it('cierra el pool de conexiones al apagar el módulo', () => {
    const { sender, transporter } = buildSender();
    const close = jest.spyOn(transporter, 'close');
    sender.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
});

describe('createMailTransport', () => {
  const configService = (env: Record<string, string>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

  it('usa ConsoleMailSender si MAIL_TRANSPORT no está definido', () => {
    expect(createMailTransport(configService({}))).toBeInstanceOf(ConsoleMailSender);
  });

  it('usa SmtpMailSender con MAIL_TRANSPORT=smtp', () => {
    const transport = createMailTransport(configService(SMTP_ENV));
    expect(transport).toBeInstanceOf(SmtpMailSender);
    (transport as SmtpMailSender).onModuleDestroy();
  });

  // Regresión: con ConfigModule({ validate }) solo llega a ConfigService lo que devuelve validateEnv;
  // si el esquema global no declara las variables de correo, se pierden y se usa la consola
  it('lee las variables de correo desde .env a través de validateEnv', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mail-env-'));
    const envFile = join(dir, '.env');
    writeFileSync(
      envFile,
      [
        'DATABASE_URL=postgresql://u:p@localhost:5432/db',
        ...Object.entries(SMTP_ENV).map(([key, value]) => `${key}="${value}"`),
      ].join('\n'),
    );
    const keys = ['DATABASE_URL', ...Object.keys(SMTP_ENV)];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    @Module({ imports: [ConfigModule.forRoot({ validate: validateEnv, envFilePath: envFile })] })
    class EnvModule {}
    const app = await NestFactory.createApplicationContext(EnvModule, { logger: false });
    try {
      const transport = createMailTransport(app.get(ConfigService));
      expect(transport).toBeInstanceOf(SmtpMailSender);
      (transport as SmtpMailSender).onModuleDestroy();
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
      // ConfigModule copia lo validado a process.env; se restaura para no afectar otros tests
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it('impide arrancar con MAIL_TRANSPORT=smtp incompleto', () => {
    expect(() => createMailTransport(configService({ MAIL_TRANSPORT: 'smtp' }))).toThrow(
      'MAIL_TRANSPORT=smtp requiere',
    );
  });
});
