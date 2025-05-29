import puppeteer from "puppeteer";
import { promises as fs } from 'fs';
import path from 'path';

const PDFs_DIR = path.resolve('PDFs');


export const generatePDF = async (htmlContent: string): Promise<string> => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({ format: "A4", printBackground: true });

  await browser.close();

  await fs.mkdir(PDFs_DIR, { recursive: true });

  const fileName = `pdf-${Date.now()}.pdf`;
  const filePath = path.join(PDFs_DIR, fileName);
  await fs.writeFile(filePath, pdf);

  return filePath;
};
