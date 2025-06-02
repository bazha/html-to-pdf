import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';

const htmlSchema = z.object({
  html: z.string()
    .min(10, { message: 'HTML too short' })
    .max(50000, { message: 'HTML too large' }),
});

export const validateHtml: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const validation = htmlSchema.safeParse(req.body);

  if (!validation.success) {
    const errors = validation.error.errors.map(e => e.message).join(', ');
    res.status(400).json({ error: `Error validation: ${errors}` });
    return;
  }

  next();
};