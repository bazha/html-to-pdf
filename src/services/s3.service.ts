import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream'
import dotenv from 'dotenv';

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const uploadPdfToS3 = async (
  fileBuffer: Buffer,
  filename: string
): Promise<string> => {
  const bucket = process.env.AWS_S3_BUCKET!;
  const key = `pdfs/${filename}`;

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: Readable.from(fileBuffer),
      ContentType: 'application/pdf'
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  })

  upload.on('httpUploadProgress', (progress) => {
    console.log(`Uploaded: ${progress.loaded}/${progress.total}`)
  })

  await upload.done()


  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};