import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { s3 } from "../config/s3.config";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const S3_BUCKET = env.AWS_S3_BUCKET;

export const PRESIGNED_URL_EXPIRY_SECONDS = 600;

const uploadPdfToS3 = async (
  fileBuffer: Uint8Array,
  filename: string,
): Promise<string> => {
  const key = `pdfs/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: "application/pdf",
      ContentLength: fileBuffer.length,
    }),
  );

  return key;
};

const getPresignedUrlFromS3 = async (
  key: string,
  expiresInSeconds = PRESIGNED_URL_EXPIRY_SECONDS,
): Promise<string> => {
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    logger.error(
      { err, key },
      "[S3Service][getPresignedUrlFromS3] error generating pre-signed URL",
    );
    throw new Error("Failed to generate pre-signed URL");
  }
};

export { uploadPdfToS3, getPresignedUrlFromS3 };
