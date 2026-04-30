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

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

export const requestContext: RequestHandler = (req, _res, next) => {
  const headerId = req.header('x-request-id');
  req.id = headerId && REQUEST_ID_PATTERN.test(headerId) ? headerId : randomUUID();
  req.log = logger.child({ reqId: req.id });
  next();
};
