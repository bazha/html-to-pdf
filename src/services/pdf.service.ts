import puppeteer from "puppeteer";

export const generatePDFBuffer = async (htmlContent: string): Promise<Buffer> => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

  await browser.close();

  return Buffer.from(pdfBuffer);
};
