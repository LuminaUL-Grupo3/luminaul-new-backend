import { Logger } from '@nestjs/common';
import { CodeMail, MailSender } from './mail-sender';

// Decorator sobre el adapter real (consola hoy, SMTP después): el envío se lanza sin esperarlo.
// - La respuesta HTTP no espera al SMTP (latencia).
// - forgot-password y resend-code tardan lo mismo exista o no el correo (sin filtración por tiempo).
// - Un fallo del SMTP queda en el log y no rompe la petición; el usuario puede pedir otro código.
// Limitación: sin reintentos ni persistencia; un correo en vuelo se pierde si el proceso se reinicia.
export class NonBlockingMailSender extends MailSender {
  private readonly logger = new Logger('MailSender');

  constructor(private readonly transport: MailSender) {
    super();
  }

  async sendVerificationCode(mail: CodeMail): Promise<void> {
    this.dispatch('verificación', mail.to, () => this.transport.sendVerificationCode(mail));
  }

  async sendPasswordResetCode(mail: CodeMail): Promise<void> {
    this.dispatch('recuperación', mail.to, () => this.transport.sendPasswordResetCode(mail));
  }

  private dispatch(kind: string, to: string, send: () => Promise<void>): void {
    // setImmediate: el envío empieza después de que la petición actual termine su turno.
    // Promise.resolve().then(...) también atrapa errores lanzados de forma síncrona.
    setImmediate(() => {
      Promise.resolve()
        .then(send)
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`No se pudo enviar el correo de ${kind} a ${to}: ${reason}`);
        });
    });
  }
}
