import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Hoisted cache for redis mock
const redisCache = vi.hoisted(() => new Map<string, string>());

vi.mock("../../src/queues/queue", () => ({
  pdfQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    getJob: vi.fn().mockResolvedValue({
      returnvalue: { key: "pdfs/test.pdf" },
      getState: vi.fn().mockResolvedValue("completed"),
    }),
  },
}));

// Avoid initializing bull-board with mock queue
vi.mock("../../src/monitoring/queues/bull-board", () => ({
  setupQueueDashboard: () => {},
}));

vi.mock("../../src/config/redis.config", () => ({
  redisClient: {
    get: vi.fn(async (key: string) => redisCache.get(key)?.toString() ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      redisCache.set(key, value);
      return "OK";
    }),
  },
}));

vi.mock("../../src/services/s3.service", () => ({
  getPresignedUrlFromS3: vi.fn(async (key: string) => `https://example.com/${key}`),
}));

// Import app after mocks
import app from "../../src/app";
import { pdfQueue } from "../../src/queues/queue";
import { redisClient } from "../../src/config/redis.config";

describe("PDF routes", () => {
  beforeEach(() => {
    redisCache.clear();
    vi.clearAllMocks();
  });

  it("POST /markdown - generates job from markdown content", async () => {
    const res = await request(app)
      .post("/markdown")
      .send({ content: "# Hello\n\nThis is **markdown**" })
      .expect(200);

    expect(res.body.file).toBeTruthy();
    expect(res.body.jobId).toBe("job-1");
    expect(res.body.detectedType).toBe("markdown");
    expect(pdfQueue.add).toHaveBeenCalledTimes(1);
    expect((pdfQueue.add as any).mock.calls[0][0]).toBe("generatePdf");
  });

  it("POST /pdf - rejects missing content", async () => {
    const res = await request(app).post("/pdf").send({}).expect(400);
    expect(res.body.error).toBe("Validation error: Required");
  });

  it("GET /pdf/:jobId/url - returns presigned URL and caches it", async () => {
    const jobId = "job-123";

    const first = await request(app).get(`/pdf/${jobId}/url`).expect(200);
    expect(first.body.url).toBe("https://example.com/pdfs/test.pdf");
    expect(first.body.cached).toBe(false);
    expect(pdfQueue.getJob).toHaveBeenCalledTimes(1);

    const second = await request(app).get(`/pdf/${jobId}/url`).expect(200);
    expect(second.body.url).toBe("https://example.com/pdfs/test.pdf");
    expect(second.body.cached).toBe(true);
    // getJob should not be called again because of cache
    expect(pdfQueue.getJob).toHaveBeenCalledTimes(1);
  });
});

