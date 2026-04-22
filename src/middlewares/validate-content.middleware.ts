import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';

const contentSchema = z.object({
  content: z.string()
    .min(10, { message: 'Content too short' })
    .max(50000, { message: 'Content too large' }),
});

export const validateContent: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const validation = contentSchema.safeParse(req.body);

  if (!validation.success) {
    const errors = validation.error.errors.map(e => e.message).join(', ');
    res.status(400).json({ error: `Validation error: ${errors}` });
    return;
  }

  next();
};
