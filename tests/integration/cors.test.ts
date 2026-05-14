import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

const { bullBoardMockFactory, s3ServiceMockFactory } = await vi.hoisted(
  async () => await import("./mock-factories"),
);

vi.mock("../../src/queues/queue", () => ({
  pdfQueue: { add: vi.fn(), getJob: vi.fn() },
  PDF_QUEUE_NAME: "pdfGeneration",
  PDF_JOB_NAME: "generatePdf",
}));
vi.mock("../../src/monitoring/queues/bull-board", bullBoardMockFactory);
vi.mock("../../src/config/redis.config", () => ({
  appRedisClient: {
    get: vi.fn(),
    setex: vi.fn(),
    ping: vi.fn(async () => "PONG"),
    quit: vi.fn(),
  },
  bullmqConnection: { quit: vi.fn() },
}));
vi.mock("../../src/services/s3.service", s3ServiceMockFactory);

beforeAll(() => {
  process.env.CORS_ORIGINS = "http://localhost:5173,https://playground.example.com";
});

const importApp = async () => (await import("../../src/app")).default;

describe("CORS middleware", () => {
  it("allows requests from origins in CORS_ORIGINS", async () => {
    const app = await importApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("rejects (omits header for) origins not in CORS_ORIGINS", async () => {
    const app = await importApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("responds 204 to preflight OPTIONS from allowed origin", async () => {
    const app = await importApp();
    const res = await request(app)
      .options("/pdf")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
  });
});
