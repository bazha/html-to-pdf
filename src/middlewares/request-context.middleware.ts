  import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
    }
  }
}

export const requestContext: RequestHandler = (req, _res, next) => {
  const headerId = req.header('x-request-id');
  req.id = headerId && headerId.length > 0 ? headerId : randomUUID();
  req.log = logger.child({ reqId: req.id });
  next();
};
