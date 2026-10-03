import { z } from 'zod';

export const envValidationSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(8000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Secreto HS256 con el que se firman los JWT; requerido por /auth/logout
  JWT_SECRET: z.string().min(16).optional(),
});

export type EnvConfig = z.infer<typeof envValidationSchema>;
