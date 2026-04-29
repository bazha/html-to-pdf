import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const log = req.log ?? logger;

  if (err instanceof ZodError) {
    const message = err.errors.map((e) => e.message).join(', ');
    res.status(400).json({ error: `Validation error: ${message}` });
    return;
  }

  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  log.error({ err }, '[ErrorHandler][errorHandler] unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
};
