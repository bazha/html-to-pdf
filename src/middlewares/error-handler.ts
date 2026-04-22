import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const log = req.log ?? logger;
  log.error({ err }, '[ErrorHandler][errorHandler] unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
};
