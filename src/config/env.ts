import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_REGION: z.string().min(1),
    AWS_S3_BUCKET: z.string().min(1),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    PORT: z.coerce.number().int().positive().default(3000),
    BULL_BOARD_USER: z.string().min(1).optional(),
    BULL_BOARD_PASSWORD: z.string().min(1).optional(),
  })
  .refine(
    (v) => !!v.BULL_BOARD_USER === !!v.BULL_BOARD_PASSWORD,
    {
      message:
        'BULL_BOARD_USER and BULL_BOARD_PASSWORD must be set together (or both left unset)',
      path: ['BULL_BOARD_USER'],
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '[Env][validate] Invalid environment variables:',
    JSON.stringify(parsed.error.flatten().fieldErrors),
  );
  process.exit(1);
}

export const env = parsed.data;
