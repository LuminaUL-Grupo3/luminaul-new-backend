import { z } from 'zod';

export const envValidationSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().min(1).max(65535).default(8000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    OPENAI_API_KEY: z.string().optional(),
    // Secreto HS256 con el que se firman los JWT; obligatorio en producción (mínimo 32 caracteres)
    JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres').optional(),
    JWT_EXPIRES_IN: z.string().optional(),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).optional(),
    // Correo de SPEC-01. Deben declararse aquí: validateEnv descarta las variables desconocidas
    // y ConfigModule solo expone las que devuelve. Las reglas finas viven en
    // modules/auth-security/config/mail.config.ts.
    MAIL_TRANSPORT: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_SECURE: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().optional(),
  })
  .refine(
    (data) => data.NODE_ENV !== 'production' || (!!data.JWT_SECRET && data.JWT_SECRET.length >= 32),
    {
      message: 'JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres',
      path: ['JWT_SECRET'],
    },
  );

export type EnvConfig = z.infer<typeof envValidationSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envValidationSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('; ');
    throw new Error(`[Config Validation Error] ${issues}`);
  }
  return parsed.data;
}
