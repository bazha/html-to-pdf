import { Request, Response, NextFunction } from "express";
import { pdfQueue } from "../queues/queue";
import { redisClient } from "../config/redis.config";
import { getPresignedUrlFromS3 } from "../services/s3.service";

const generatePdf = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { html } = req.body;
  const fileName = `document-${Date.now()}.pdf`;
  try {
    await pdfQueue.add("generatePdf", { html, fileName });

    res.status(200).json({
      message: "✅ PDF is created and stored",
      file: fileName,
    });
  } catch (err) {
    next(err);
  }
};

const getPdfUrlByJobId = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | undefined> => {
  const { jobId } = req.params;
  const cacheKey = `pdf:url:${jobId}`;

  const cachedUrl = await redisClient.get(cacheKey);
  if (cachedUrl) {
    return res.status(200).json({ url: cachedUrl, cached: true });
  }

  try {
    const job = await pdfQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: `Job with ID ${jobId} not found` });
    }
    const { key } = job.returnvalue || {};
    if (!key) {
      return res.status(500).json({ error: "No key in job return value" });
    }

    const signedUrl = await getPresignedUrlFromS3(key);

    await redisClient.setex(cacheKey, 300, signedUrl);

    return res.status(200).json({ url: signedUrl, cached: false });
  } catch (err) {
    next(err);
  }
};

export { generatePdf, getPdfUrlByJobId };
