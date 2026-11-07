import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleMailSender, MailSender } from './mail-sender';
import { createSmtpTransporter, SmtpMailSender } from './smtp-mail-sender';
import { loadMailConfig } from '../config/mail.config';

// Token del transporte real; MailSender (lo que piden los servicios) lo envuelve en NonBlockingMailSender
export const MAIL_TRANSPORT = 'AUTH_MAIL_TRANSPORT';

// Factory: elige el adapter según MAIL_TRANSPORT (console por defecto)
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
