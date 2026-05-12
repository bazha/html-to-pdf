import puppeteer, { Browser } from "puppeteer";
import { logger } from "../utils/logger";

const SET_CONTENT_TIMEOUT_MS = 30_000;
const PDF_RENDER_TIMEOUT_MS = 30_000;

let browserPromise: Promise<Browser> | null = null;
let closing = false;

const getBrowser = (): Promise<Browser> => {
  if (closing) {
    return Promise.reject(new Error("[PdfService] browser is shutting down"));
  }
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ args: ["--no-sandbox"] }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
};

const ALLOWED_RESOURCE_SCHEMES = new Set(["data:", "about:"]);

export const generatePDFBuffer = async (htmlContent: string): Promise<Uint8Array> => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      const scheme = url.slice(0, url.indexOf(":") + 1).toLowerCase();
      if (ALLOWED_RESOURCE_SCHEMES.has(scheme)) {
        req.continue();
      } else {
        req.abort();
      }
    });

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
  // Set closing first so concurrent getBrowser() calls reject instead of
  // launching a new browser that would leak past shutdown.
  closing = true;
  if (!browserPromise) return;
  const pending = browserPromise;
  try {
    const browser = await pending;
    await browser.close();
  } catch (err) {
    logger.warn(
      { err },
      "[PdfService][closeBrowser] error while closing browser",
    );
  } finally {
    browserPromise = null;
  }
};
