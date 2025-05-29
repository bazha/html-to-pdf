import { Request, Response, NextFunction } from "express";
import { generatePDF } from "../services/pdf.service";
import path from 'path';

export const handlePDFRequest = async (
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
      message: '✅ PDF создан и сохранён',
      file: fileName,
      path: filePath
    });
  } catch (err) {
    next(err);
  }
};
