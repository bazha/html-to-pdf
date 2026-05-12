import { Worker, Job, UnrecoverableError } from "bullmq";
import { bullmqConnection } from "../config/redis.config";
import { PDF_QUEUE_NAME } from "../queues/queue";
import { generatePDFBuffer } from "../services/pdf.service";
import { uploadPdfToS3 } from "../services/s3.service";
import { logger } from "../utils/logger";

export const JOB_TIMEOUT_MS = 75_000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new UnrecoverableError(`Job timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const pdfWorker = new Worker(
  PDF_QUEUE_NAME,
  async (job: Job) => {
    const { html, fileName, reqId } = job.data;
    const jobLog = logger.child({ reqId, jobId: job.id });

    jobLog.info({ fileName }, "[PdfWorker][process] start");
    const run = async () => {
      const pdfBuffer = await generatePDFBuffer(html);
      const key = await uploadPdfToS3(pdfBuffer, fileName);
      return { key, fileSize: pdfBuffer.length };
    };

    // Timeouts throw UnrecoverableError so BullMQ skips retries — a single
    // bad job should not occupy the worker for attempts × JOB_TIMEOUT_MS.
    const result = await withTimeout(run(), JOB_TIMEOUT_MS);
    jobLog.info(
      { key: result.key, fileSize: result.fileSize },
      "[PdfWorker][process] done",
    );
    return result;
  },
  {
    connection: bullmqConnection,
    // One Puppeteer page at a time per worker — single shared browser.
    concurrency: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { age: 3 * 24 * 3600 },
  },
);

pdfWorker.on("error", (err) => {
  logger.error({ err }, "[PdfWorker][error] worker error");
});

pdfWorker.on("failed", (job, err) => {
  logger.error(
    { err, jobId: job?.id, reqId: job?.data?.reqId },
    "[PdfWorker][failed] job failed",
  );
});
