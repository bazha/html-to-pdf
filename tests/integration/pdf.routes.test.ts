import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { bullBoardMockFactory, s3ServiceMockFactory } = await vi.hoisted(
  async () => await import("./mock-factories"),
);

// Hoisted state for redis + queue mocks specific to this file's scenarios.
const redisCache = vi.hoisted(() => new Map<string, string>());
const redisPing = vi.hoisted(() => vi.fn(async () => "PONG"));

vi.mock("../../src/queues/queue", () => ({
  pdfQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    getJob: vi.fn().mockResolvedValue({
      returnvalue: { key: "pdfs/test.pdf" },
      getState: vi.fn().mockResolvedValue("completed"),
    }),
  },
}));

vi.mock("../../src/monitoring/queues/bull-board", bullBoardMockFactory);

vi.mock("../../src/config/redis.config", () => ({
  redisClient: {
    get: vi.fn(async (key: string) => redisCache.get(key)?.toString() ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      redisCache.set(key, value);
      return "OK";
    }),
    ping: redisPing,
  },
}));

vi.mock("../../src/services/s3.service", s3ServiceMockFactory);

// Import app after mocks
import app from "../../src/app";
import { pdfQueue } from "../../src/queues/queue";

describe("PDF routes", () => {
  beforeEach(() => {
    redisCache.clear();
    vi.clearAllMocks();
    (pdfQueue.getJob as any).mockResolvedValue({
      returnvalue: { key: "pdfs/test.pdf" },
      getState: vi.fn().mockResolvedValue("completed"),
    });
  });

  it("POST /markdown - generates job from markdown content", async () => {
    const res = await request(app)
      .post("/markdown")
      .send({ content: "# Hello\n\nThis is **markdown**" })
      .expect(202);

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

  it("POST /pdf - propagates x-request-id into job data", async () => {
    await request(app)
      .post("/pdf")
      .set("x-request-id", "req-abc-123")
      .send({ content: "<h1>Hello world</h1>" })
      .expect(202);

    const jobData = (pdfQueue.add as any).mock.calls[0][1];
    expect(jobData.reqId).toBe("req-abc-123");
  });

  it("GET /pdf/:jobId/url - returns presigned URL and caches it", async () => {
    const jobId = "job-123";

    const first = await request(app).get(`/pdf/${jobId}/url`).expect(200);
    expect(first.body.status).toBe("completed");
    expect(first.body.url).toBe("https://example.com/pdfs/test.pdf");
    expect(first.body.cached).toBe(false);
    expect(pdfQueue.getJob).toHaveBeenCalledTimes(1);

    const second = await request(app).get(`/pdf/${jobId}/url`).expect(200);
    expect(second.body.status).toBe("completed");
    expect(second.body.url).toBe("https://example.com/pdfs/test.pdf");
    expect(second.body.cached).toBe(true);
    // getJob should not be called again because of cache
    expect(pdfQueue.getJob).toHaveBeenCalledTimes(1);
  });

  it("GET /pdf/:jobId/url - returns 404 when job does not exist", async () => {
    (pdfQueue.getJob as any).mockResolvedValueOnce(undefined);

    const res = await request(app).get("/pdf/missing/url").expect(404);
    expect(res.body.error).toContain("missing");
  });

  it("GET /pdf/:jobId/url - returns 422 with sanitized reason when job failed", async () => {
    (pdfQueue.getJob as any).mockResolvedValueOnce({
      returnvalue: undefined,
      failedReason: "Puppeteer crashed",
      getState: vi.fn().mockResolvedValue("failed"),
    });

    const res = await request(app).get("/pdf/failed-job/url").expect(422);
    expect(res.body.status).toBe("failed");
    expect(res.body.reason).toBe("PDF generation failed");
  });

  it("GET /pdf/:jobId/url - returns active status in body when job is still active", async () => {
    (pdfQueue.getJob as any).mockResolvedValueOnce({
      returnvalue: undefined,
      getState: vi.fn().mockResolvedValue("active"),
    });

    const res = await request(app).get("/pdf/active-job/url").expect(200);
    expect(res.body.status).toBe("active");
  });

  it("GET /pdf/:jobId/url - returns 500 when completed job has no S3 key", async () => {
    (pdfQueue.getJob as any).mockResolvedValueOnce({
      returnvalue: {},
      getState: vi.fn().mockResolvedValue("completed"),
    });

    const res = await request(app).get("/pdf/no-key/url").expect(500);
    expect(res.body.error).toContain("missing S3 key");
  });

  it("GET /health - returns 200", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /ready - returns 200 when redis ping succeeds", async () => {
    redisPing.mockResolvedValueOnce("PONG");
    const res = await request(app).get("/ready").expect(200);
    expect(res.body.status).toBe("ready");
  });

  it("GET /ready - returns 503 when redis ping fails", async () => {
    redisPing.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await request(app).get("/ready").expect(503);
    expect(res.body.status).toBe("not ready");
  });

  it("POST /markdown - strips <script> from sanitized HTML before enqueue", async () => {
    await request(app)
      .post("/markdown")
      .send({
        content:
          "# Hi\n\n<script>fetch('//evil')</script>\n\n<img src=\"file:///etc/passwd\">",
      })
      .expect(202);

    const enqueued = (pdfQueue.add as any).mock.calls[0][1];
    expect(enqueued.html).not.toContain("<script");
    expect(enqueued.html).not.toContain("file:");
  });
});

