import puppeteer, { Browser } from "puppeteer";
import { logger } from "../utils/logger";

const SET_CONTENT_TIMEOUT_MS = 30_000;
const PDF_RENDER_TIMEOUT_MS = 30_000;

let browserPromise: Promise<Browser> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ args: ["--no-sandbox"] }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
};

export const generatePDFBuffer = async (htmlContent: string): Promise<Uint8Array> => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(htmlContent, {
      waitUntil: "domcontentloaded",
      timeout: SET_CONTENT_TIMEOUT_MS,
    });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      timeout: PDF_RENDER_TIMEOUT_MS,
    });
  } finally {
    await page.close().catch((closeErr) => {
      logger.warn(
        { err: closeErr },
        "[PdfService][generatePDFBuffer] page.close() failed",
      );
    });
  }
};

export const closeBrowser = async (): Promise<void> => {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending;
  await browser.close();
};
