import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePDFBuffer } from "../../src/services/pdf.service";

// Mock puppeteer to avoid launching a real browser
vi.mock("puppeteer", () => {
  const pdfBuffer = Buffer.from("PDF-DATA");

  const page = {
    setContent: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(pdfBuffer),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: {
      launch: vi.fn().mockResolvedValue(browser),
    },
  };
});

describe("pdf.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a PDF buffer from HTML", async () => {
    const html = "<h1>Hello</h1>";
    const buffer = await generatePDFBuffer(html);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe("PDF-DATA");
  });
});

