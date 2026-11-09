import { Injectable, Logger } from '@nestjs/common';
import { CodeMail, MailSender } from '../MailSender';

// Implementación de desarrollo: no hay infraestructura de correo, el código se imprime en el log.
// En producción se enmascara para evitar fugas en herramientas de recolección de logs.
@Injectable()
export class ConsoleMailSender extends MailSender {
  private readonly logger = new Logger('MailSender');

  async sendVerificationCode(mail: CodeMail): Promise<void> {
    this.log('verificación', mail);
  }

  async sendPasswordResetCode(mail: CodeMail): Promise<void> {
    this.log('recuperación', mail);
  }

  private log(kind: string, mail: CodeMail): void {
    const isProd = process.env.NODE_ENV === 'production';
    const displayCode = isProd ? '******' : mail.code;
    this.logger.log(
      `[${kind}] ${mail.to} (${mail.name}): código ${displayCode}, vence ${mail.expiresAt.toISOString()}`,
    );
  }
}
