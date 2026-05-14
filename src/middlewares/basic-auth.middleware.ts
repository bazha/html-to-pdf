import { RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'crypto';

// Hash both inputs to a fixed length before comparison so timingSafeEqual
// runs against equal-length buffers regardless of input length — otherwise
// a length mismatch short-circuits and leaks length information.
const safeEqual = (a: string, b: string): boolean => {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
};

export const basicAuth = (user: string, password: string): RequestHandler => {
  return (req, res, next) => {
    const header = req.header('authorization');
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep !== -1) {
        const providedUser = decoded.slice(0, sep);
        const providedPassword = decoded.slice(sep + 1);
        if (safeEqual(providedUser, user) && safeEqual(providedPassword, password)) {
          next();
          return;
        }
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="queues"');
    res.status(401).send('Authentication required');
  };
};
