import { Request, Response } from "express";
import { pdfQueue } from "../queues/queue";
import { redisClient } from "../config/redis.config";
import { getPresignedUrlFromS3 } from "../services/s3.service";
import { generateHtmlFromAnyContent } from "../services/content.service";

const generatePdf = async (req: Request, res: Response): Promise<void> => {
  const { content } = req.body;
  const fileName = `document-${Date.now()}.pdf`;

  const { html, detectedType } = generateHtmlFromAnyContent(content);
  const job = await pdfQueue.add("generatePdf", { html, fileName });

  res.status(200).json({
    message: "✅ PDF is created and stored",
    jobId: job.id,
    file: fileName,
    detectedType,
  });
};

const getPdfUrlByJobId = async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;
  const cacheKey = `pdf:url:${jobId}`;

  const cachedUrl = await redisClient.get(cacheKey);
  if (cachedUrl) {
    res.status(200).json({ url: cachedUrl, cached: true });
    return;
  }

  const job = await pdfQueue.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: `Job with ID ${jobId} not found` });
    return;
  }

  const { key } = job.returnvalue || {};
  if (!key) {
    res.status(500).json({ error: "No key in job return value" });
    return;
  }

  const signedUrl = await getPresignedUrlFromS3(key);
  await redisClient.setex(cacheKey, 300, signedUrl);

  res.status(200).json({ url: signedUrl, cached: false });
};

export { generatePdf, getPdfUrlByJobId };
