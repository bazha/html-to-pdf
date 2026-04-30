import { Queue } from 'bullmq';
import { redisClient } from '../config/redis.config';

export const PDF_QUEUE_NAME = 'pdfGeneration';

export const pdfQueue = new Queue(PDF_QUEUE_NAME, {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});
