import { Request, Response, NextFunction } from "express";
import { pdfQueue } from "../queues/queue";

export const PDFController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { html } = req.body;
  const fileName = `document-${Date.now()}.pdf`;
  try {
    await pdfQueue.add("generatePdf", { html, fileName });

    res.status(200).json({
      message: "✅ PDF is created and stored",
      file: fileName,
    });
  } catch (err) {
    next(err);
  }
};
