import { Worker, Job } from "bullmq";
import { redisClient } from "../config/redis.config";
import { generatePDFBuffer } from "../services/pdf.service";
import { uploadPdfToS3 } from "../services/s3.service";
import { logger } from "../utils/logger";

export const pdfWorker = new Worker(
  "pdfGeneration",
  async (job: Job) => {
    const { html, fileName, reqId } = job.data;
    const jobLog = logger.child({ reqId, jobId: job.id });

    jobLog.info({ fileName }, "[PdfWorker][process] start");
    const pdfBuffer = await generatePDFBuffer(html);
    const key = await uploadPdfToS3(pdfBuffer, fileName);
    jobLog.info({ key, fileSize: pdfBuffer.length }, "[PdfWorker][process] done");

    return { key, fileSize: pdfBuffer.length };
  },
  {
    connection: redisClient,
    removeOnComplete: {
      count: 100,
    },
    removeOnFail: {
      age: 3 * 24 * 3600,
    },
  }
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
