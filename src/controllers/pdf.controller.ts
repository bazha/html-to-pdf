import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { pdfQueue } from "../queues/queue";
import { redisClient } from "../config/redis.config";
import {
  getPresignedUrlFromS3,
  PRESIGNED_URL_EXPIRY_SECONDS,
} from "../services/s3.service";
import { generateHtmlFromAnyContent } from "../services/content.service";
import type { ContentBody } from "../middlewares/validate-content.middleware";

const URL_CACHE_TTL_SECONDS = PRESIGNED_URL_EXPIRY_SECONDS - 60;

const generatePdf = async (
  req: Request<unknown, unknown, ContentBody>,
  res: Response,
): Promise<void> => {
  const { content } = req.body;
  const fileName = `${randomUUID()}.pdf`;

  const { html, detectedType } = generateHtmlFromAnyContent(content);
  const job = await pdfQueue.add("generatePdf", {
    html,
    fileName,
    reqId: req.id,
  });

  req.log.info(
    { jobId: job.id, fileName, detectedType },
    "[PdfController][generatePdf] job enqueued",
  );

  res.status(202).json({
    message: "PDF generation accepted",
    jobId: job.id,
    file: fileName,
    detectedType,
  });
};

const getPdfUrlByJobId = async (
  req: Request<{ jobId: string }>,
  res: Response,
): Promise<void> => {
  const { jobId } = req.params;
  const cacheKey = `pdf:url:${jobId}`;

  const cachedUrl = await redisClient.get(cacheKey);
  if (cachedUrl) {
    res.status(200).json({ status: "completed", url: cachedUrl, cached: true });
    return;
  }

  const job = await pdfQueue.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: `Job with ID ${jobId} not found` });
    return;
  }

  const state = await job.getState();

  if (state === "failed") {
    req.log.warn(
      { jobId, failedReason: job.failedReason },
      "[PdfController][getPdfUrlByJobId] job failed",
    );
    res.status(422).json({ status: "failed", reason: "PDF generation failed" });
    return;
  }

  if (state !== "completed") {
    res.status(200).json({ status: state });
    return;
  }

  const key = job.returnvalue?.key;
  if (!key) {
    res.status(500).json({ error: "Completed job is missing S3 key" });
    return;
  }

  const signedUrl = await getPresignedUrlFromS3(key);
  await redisClient.setex(cacheKey, URL_CACHE_TTL_SECONDS, signedUrl);

  res.status(200).json({ status: "completed", url: signedUrl, cached: false });
};

export { generatePdf, getPdfUrlByJobId };
