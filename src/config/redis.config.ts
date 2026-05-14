import Redis from 'ioredis';
import { env } from './env';

const baseOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

// BullMQ requires maxRetriesPerRequest=null on connections used by Workers
// (it issues blocking commands). This connection is shared by Queue and
// Worker so they can coordinate on the same socket pool.
export const bullmqConnection = new Redis({
  ...baseOptions,
  maxRetriesPerRequest: null,
});

// Separate connection for application-level traffic (cache GET/SETEX,
// /ready ping). Keeping it off the BullMQ connection avoids serialization
// behind blocking commands like BLPOP.
export const appRedisClient = new Redis(baseOptions);
