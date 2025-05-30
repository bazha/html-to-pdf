import { Worker, Job } from "bullmq";
import { redisClient } from "../config/redis.config";
import { generatePDFBuffer } from "../services/pdf.service";
import { uploadPdfToS3 } from "../services/s3.service";

export const pdfWorker = new Worker(
  "pdfGeneration",
  async (job: Job) => {
    const { html, fileName } = job.data;
    try {
      const pdfBuffer = await generatePDFBuffer(html);
      const s3Url = await uploadPdfToS3(pdfBuffer, fileName);

      return { s3Url };
    } catch (error: any) {
      console.error("Worker error:", error);
      return { success: false, error: error.message };
    }
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
  console.error(err);
});
