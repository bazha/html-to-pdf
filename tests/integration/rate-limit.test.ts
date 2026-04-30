import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../src/queues/queue", () => ({
  pdfQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-rl" }),
    getJob: vi.fn(),
  },
}));

vi.mock("../../src/monitoring/queues/bull-board", () => ({
  setupQueueDashboard: () => {},
}));

vi.mock("../../src/config/redis.config", () => ({
  redisClient: {
    get: vi.fn(async () => null),
    setex: vi.fn(async () => "OK"),
    ping: vi.fn(async () => "PONG"),
  },
}));

vi.mock("../../src/services/s3.service", () => ({
  getPresignedUrlFromS3: vi.fn(),
  PRESIGNED_URL_EXPIRY_SECONDS: 600,
}));

import app from "../../src/app";

describe("rate limiting on /pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 after exceeding the per-minute limit", async () => {
    const body = { content: "<h1>Rate limit probe content</h1>" };
    const limit = 20;

    for (let i = 0; i < limit; i++) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).post("/pdf").send(body).expect(202);
    }

    const blocked = await request(app).post("/pdf").send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Too many");
  });
});
