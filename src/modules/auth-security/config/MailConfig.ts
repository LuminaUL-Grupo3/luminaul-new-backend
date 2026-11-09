import { z } from 'zod';

// Variables de entorno del correo. src/config/env.validation.ts solo las declara (si no, validateEnv
// las descarta); aquí se validan en detalle porque solo las usa este módulo.
const mailEnvSchema = z.object({
  // console: imprime el código en el log (desarrollo). smtp: envía correos reales.
  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  // true: TLS directo (puerto 465). false: STARTTLS (puerto 587). Por defecto se deduce del puerto.
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // Remitente visible, p. ej. "LuminaUL <no-reply@dominio>"
  MAIL_FROM: z.string().trim().optional(),
});

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export type MailConfig =
  | { transport: 'console' }
  | { transport: 'smtp'; smtp: SmtpSettings; from: string };

const REQUIRED_FOR_SMTP = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'] as const;

// Falla al arrancar si MAIL_TRANSPORT=smtp está incompleto: es mejor que descubrirlo cuando
// un usuario no recibe su código
export function loadMailConfig(readEnv: (key: string) => string | undefined): MailConfig {
  const raw = Object.fromEntries(
    Object.keys(mailEnvSchema.shape).map((key) => [key, readEnv(key) || undefined]),
  );
  const parsed = mailEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[Mail Config] ${issues}`);
  }
  const env = parsed.data;
  if (env.MAIL_TRANSPORT === 'console') {
    return { transport: 'console' };
  }

  const missing = REQUIRED_FOR_SMTP.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`[Mail Config] MAIL_TRANSPORT=smtp requiere: ${missing.join(', ')}`);
  }
  return {
    transport: 'smtp',
    from: env.MAIL_FROM as string,
    smtp: {
      host: env.SMTP_HOST as string,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
      user: env.SMTP_USER as string,
      password: env.SMTP_PASSWORD as string,
    },
  };
}
