import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { CodeMail, MailSender } from './mail-sender';
import { RenderedMail, renderPasswordResetMail, renderVerificationCodeMail } from './mail-templates';
import { SmtpSettings } from '../config/mail.config';

// Tiempos máximos por envío: sin ellos, un servidor SMTP colgado deja conexiones abiertas
// indefinidamente (el envío ya no bloquea la petición gracias a NonBlockingMailSender)
const SMTP_TIMEOUTS_MS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

export function createSmtpTransporter(settings: SmtpSettings): Transporter {
  return createTransport({
    // Pool: reutiliza conexiones autenticadas en vez de abrir una por correo
    pool: true,
    maxConnections: 3,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    // En 587 se exige STARTTLS: nunca se envían credenciales ni códigos sin cifrar
    requireTLS: !settings.secure,
    auth: { user: settings.user, pass: settings.password },
    ...SMTP_TIMEOUTS_MS,
  });
}

// Adapter SMTP de MailSender (nodemailer). Recibe el transporter ya creado para poder
// probarlo con un transporte en memoria.
export class SmtpMailSender extends MailSender implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MailSender');

  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {
    super();
  }

  // Comprueba conexión y credenciales al arrancar, sin bloquear el inicio de la app
  onModuleInit(): void {
    this.transporter
      .verify()
      .then(() => this.logger.log('Conexión SMTP verificada'))
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`No se pudo verificar la conexión SMTP: ${reason}`);
      });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }

  sendVerificationCode(mail: CodeMail): Promise<void> {
    return this.send(mail.to, renderVerificationCodeMail(mail));
  }

  sendPasswordResetCode(mail: CodeMail): Promise<void> {
    return this.send(mail.to, renderPasswordResetMail(mail));
  }

  private async send(to: string, rendered: RenderedMail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      // Correo transaccional: evita respuestas automáticas de vacaciones hacia el remitente
      headers: { 'Auto-Submitted': 'auto-generated' },
    });
    this.logger.log(`Correo "${rendered.subject}" enviado a ${to}`);
  }
}
