import { Request, Response, NextFunction } from "express";
import { generatePDF } from "../services/pdf.service";
import path from 'path';

export const PDFController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { html } = req.body;

    if (typeof html !== "string") {
      res.status(400).json({ error: "HTML content must be a string." });
      return;
    }

    const filePath = await generatePDF(html);
    const fileName = path.basename(filePath);

    res.status(200).json({
      message: '✅ PDF is created and stored',
      file: fileName,
      path: filePath
    });
  } catch (err) {
    next(err);
  }
};
