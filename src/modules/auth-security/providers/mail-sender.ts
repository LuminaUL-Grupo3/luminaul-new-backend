import { Injectable, Logger } from '@nestjs/common';

export interface CodeMail {
  to: string;
  name: string;
  code: string;
  expiresAt: Date;
}

// Adapter: puerto de envío de correos. Cambiar a SMTP o a un proveedor externo
// solo requiere otra implementación registrada en AuthModule.
export abstract class MailSender {
  abstract sendVerificationCode(mail: CodeMail): Promise<void>;
  abstract sendPasswordResetCode(mail: CodeMail): Promise<void>;
}

// Implementación de desarrollo: no hay infraestructura de correo, el código se imprime en el log.
// En producción se enmascara para evitar fugas en herramientas de recolección de logs.
@Injectable()
export class ConsoleMailSender extends MailSender {
  private readonly logger = new Logger('MailSender');

  async sendVerificationCode(mail: CodeMail): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production';
    const displayCode = isProd ? '******' : mail.code;
    this.logger.log(
      `[verificación] ${mail.to} (${mail.name}): código ${displayCode}, vence ${mail.expiresAt.toISOString()}`,
    );
  }

  async sendPasswordResetCode(mail: CodeMail): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production';
    const displayCode = isProd ? '******' : mail.code;
    this.logger.log(
      `[recuperación] ${mail.to} (${mail.name}): código ${displayCode}, vence ${mail.expiresAt.toISOString()}`,
    );
  }
}
