import { vi } from "vitest";

export const bullBoardMockFactory = () => ({
  setupQueueDashboard: () => {},
});

export const s3ServiceMockFactory = () => ({
  getPresignedUrlFromS3: vi.fn(
    async (key: string) => `https://example.com/${key}`,
  ),
  PRESIGNED_URL_EXPIRY_SECONDS: 600,
});
