import { Queue } from 'bullmq';
import { redisClient } from '../config/redis.config';

export const pdfQueue = new Queue('pdfGeneration', {
  connection: redisClient,
});