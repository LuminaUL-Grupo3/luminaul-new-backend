import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { MailSender } from '../mail/MailSender';
import { ConsoleMailSender } from '../mail/impl/ConsoleMailSender';
import { SmtpMailSender } from '../mail/impl/SmtpMailSender';
import { loadMailConfig, SmtpSettings } from '../config/MailConfig';

// Tiempos máximos por envío: sin ellos, un servidor SMTP colgado deja conexiones abiertas
// indefinidamente (el envío ya no bloquea la petición gracias a NonBlockingMailSender)
const SMTP_TIMEOUTS_MS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

// Simple Factory: elige el adapter de correo según MAIL_TRANSPORT (console por defecto).
// AuthModule la registra como useFactory del token MAIL_TRANSPORT.
export function createMailTransport(configService: ConfigService): MailSender {
  const config = loadMailConfig((key) => configService.get<string>(key));
  const logger = new Logger('MailSender');

  if (config.transport === 'smtp') {
    logger.log(`Correo vía SMTP (${config.smtp.host}:${config.smtp.port})`);
    return new SmtpMailSender(createSmtpTransporter(config.smtp), config.from);
  }

  if (configService.get<string>('NODE_ENV') === 'production') {
    logger.warn('MAIL_TRANSPORT=console en producción: los códigos no llegarán a los usuarios');
  }
  return new ConsoleMailSender();
}

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
