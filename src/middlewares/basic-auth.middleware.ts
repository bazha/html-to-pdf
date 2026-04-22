import { RequestHandler } from 'express';
import { timingSafeEqual } from 'crypto';

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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
