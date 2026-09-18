import { z } from 'zod';

export const envValidationSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(8000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export type EnvConfig = z.infer<typeof envValidationSchema>;
