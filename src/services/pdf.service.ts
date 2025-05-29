import puppeteer from "puppeteer";
import { uploadPdfToS3 } from "./s3.service";

export const generatePDF = async (htmlContent: string): Promise<string> => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const pdfBuffer = Buffer.from(pdf);

  await browser.close();

  const fileName = `document-${Date.now()}.pdf`;
  const fileUrl = await uploadPdfToS3(pdfBuffer, fileName);

  return fileUrl;
};
