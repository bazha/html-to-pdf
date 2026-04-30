import { RequestHandler } from 'express';
import { z } from 'zod';

export const contentSchema = z.object({
  content: z
    .string()
    .min(10, { message: 'Content too short' })
    .max(50000, { message: 'Content too large' }),
});

export type ContentBody = z.infer<typeof contentSchema>;

export const validateContent: RequestHandler = (req, res, next) => {
  const validation = contentSchema.safeParse(req.body);

  if (!validation.success) {
    const errors = validation.error.errors.map((e) => e.message).join(', ');
    res.status(400).json({ error: `Validation error: ${errors}` });
    return;
  }

  req.body = validation.data;
  next();
};
