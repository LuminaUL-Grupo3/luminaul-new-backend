import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

export abstract class MailDelivery {
  abstract send(to: string, subject: string, text: string): Promise<void>;
}

/** Adaptador SMTP: Mailpit local y un proveedor real usan el mismo contrato. */
@Injectable()
export class SmtpMailDelivery extends MailDelivery {
  private readonly transporter;
  constructor(private readonly config: ConfigService) {
    super();
    const user = config.get<string>('MAIL_USER');
    this.transporter = createTransport({
      host: config.get<string>('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT'),
      secure: config.get<boolean>('MAIL_SECURE'),
      ...(user ? { auth: { user, pass: config.get<string>('MAIL_PASSWORD') } } : {}),
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    });
  }
  async send(to: string, subject: string, text: string): Promise<void> {
    await this.transporter.sendMail({ from: this.config.get<string>('MAIL_FROM'), to, subject, text });
  }
}
