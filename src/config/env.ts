import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default(process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  BULL_BOARD_USER: z.string().min(1).optional(),
  BULL_BOARD_PASSWORD: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '[Env][validate] Invalid environment variables:',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
