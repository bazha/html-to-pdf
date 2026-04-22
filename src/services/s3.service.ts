import { Upload } from "@aws-sdk/lib-storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable, PassThrough } from "stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { s3 } from "../config/s3.config";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const S3_BUCKET = env.AWS_S3_BUCKET;

const uploadPdfToS3 = async (
  fileBuffer: Buffer,
  filename: string
): Promise<string> => {
  const key = `pdfs/${filename}`;
  const passThrough = new PassThrough();

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: S3_BUCKET,
      Key: key,
      Body: passThrough,
      ContentType: "application/pdf",
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  });

  Readable.from(fileBuffer).pipe(passThrough);

  await upload.done();

  return key;
};

const getPresignedUrlFromS3 = async (
  key: string,
  expiresInSeconds = 60 * 10
): Promise<string> => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
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
