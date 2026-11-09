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
