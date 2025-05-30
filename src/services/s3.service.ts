import { Upload } from '@aws-sdk/lib-storage';
import { Readable, PassThrough } from 'stream'
import { s3 } from '../config/s3.config';
import dotenv from 'dotenv';

dotenv.config();

export const uploadPdfToS3 = async (
  fileBuffer: Buffer,
  filename: string
): Promise<string> => {
  const bucket = process.env.AWS_S3_BUCKET!;
  const key = `pdfs/${filename}`;
  const passThrough = new PassThrough();

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: passThrough,
      ContentType: 'application/pdf'
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  })

  Readable.from(fileBuffer).pipe(passThrough);

  await upload.done()


  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};