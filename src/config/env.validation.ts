import { z } from 'zod';

export const envValidationSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(8000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Secreto HS256 con el que se firman los JWT; requerido por /auth/logout
  JWT_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  MAIL_HOST: z.string().default('127.0.0.1'),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(11026),
  MAIL_SECURE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('LuminaUL <no-reply@luminaul.local>'),
});

export type EnvConfig = z.infer<typeof envValidationSchema>;
