import { Queue } from 'bullmq';
import { redisClient } from '../config/redis.config';

export const pdfQueue = new Queue('pdfGeneration', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});
