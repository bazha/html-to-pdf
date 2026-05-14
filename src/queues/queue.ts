import { Queue } from 'bullmq';
import { bullmqConnection } from '../config/redis.config';

export const PDF_QUEUE_NAME = 'pdfGeneration';
export const PDF_JOB_NAME = 'generatePdf';

export const pdfQueue = new Queue(PDF_QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});
