import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const pdfBuffer = Buffer.from("PDF-DATA");
  return {
    page: {
      setContent: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(pdfBuffer),
      close: vi.fn().mockResolvedValue(undefined),
    },
    pdfBuffer,
  };
});

vi.mock("puppeteer", () => {
  const browser = {
    newPage: vi.fn().mockResolvedValue(mocks.page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {
      launch: vi.fn().mockResolvedValue(browser),
    },
  };
});

const loggerWarn = vi.fn();
vi.mock("../../src/utils/logger", () => ({
  logger: { warn: loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { generatePDFBuffer } = await import("../../src/services/pdf.service");

describe("pdf.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.page.pdf.mockResolvedValue(mocks.pdfBuffer);
    mocks.page.close.mockResolvedValue(undefined);
  });

  it("generates a PDF buffer from HTML", async () => {
    const buffer = await generatePDFBuffer("<h1>Hello</h1>");

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe("PDF-DATA");
  });

  it("propagates the render error when page.close() also fails, and logs the close error", async () => {
    mocks.page.pdf.mockRejectedValueOnce(new Error("render failed"));
    mocks.page.close.mockRejectedValueOnce(new Error("close failed"));

    await expect(generatePDFBuffer("<h1>Hi</h1>")).rejects.toThrow("render failed");

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    const [ctx, msg] = loggerWarn.mock.calls[0];
    expect(ctx.err).toBeInstanceOf(Error);
    expect((ctx.err as Error).message).toBe("close failed");
    expect(msg).toContain("page.close() failed");
  });
});

