import puppeteer, { Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ args: ["--no-sandbox"] }).catch((err) => {
      // Clear cache so the next call retries instead of re-rejecting the same promise.
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
};

export const generatePDFBuffer = async (htmlContent: string): Promise<Buffer> => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
};

export const closeBrowser = async (): Promise<void> => {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending;
  await browser.close();
};
