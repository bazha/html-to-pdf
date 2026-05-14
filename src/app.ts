import express from 'express';
import helmet from 'helmet';
import pdfRoutes from './routes/pdf.route';
import { errorHandler } from './middlewares/error-handler';
import { requestContext } from './middlewares/request-context.middleware';
import { setupQueueDashboard } from './monitoring/queues/bull-board';
import { appRedisClient } from './config/redis.config';

const app = express();

// Number of trusted reverse-proxy hops (integer >= 0; 0 = none, default).
// Read directly from process.env (not env.ts) so this module stays free of
// env-validation side effects — tests mock redis/S3 to avoid loading env.ts
// at all, and CI has no AWS creds to satisfy that schema.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

app.use(helmet());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', async (_req, res) => {
  try {
    await appRedisClient.ping();
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready', reason: 'redis unreachable' });
  }
});

app.use(requestContext);
app.use(express.json({ limit: '200kb' }));
app.use('/', pdfRoutes);
setupQueueDashboard(app);
app.use(errorHandler);

export default app;
