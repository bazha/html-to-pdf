import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// Credentials come from the default AWS provider chain (env vars, shared
// config, IAM role on EC2/ECS/EKS). env.AWS_* is validated for the env-var
// path; production deployments using IAM roles can leave them unset.
export const s3 = new S3Client({ region: env.AWS_REGION });
