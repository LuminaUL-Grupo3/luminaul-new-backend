import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Transporter } from 'nodemailer';
import { CodeMail, MailSender } from '../MailSender';
import { RenderedMail, renderPasswordResetMail, renderVerificationCodeMail } from '../MailTemplates';

// Adapter SMTP de MailSender (nodemailer). Recibe el transporter ya creado por MailTransportFactory
// para poder probarlo con un transporte en memoria.
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
