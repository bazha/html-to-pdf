import express from 'express';
import helmet from 'helmet';
import pdfRoutes from './routes/pdf.route';
import { errorHandler } from './middlewares/error-handler';
import { requestContext } from './middlewares/request-context.middleware';
import { setupQueueDashboard } from './monitoring/queues/bull-board';
import { redisClient } from './config/redis.config';

const app = express();

app.use(helmet());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', async (_req, res) => {
  try {
    await redisClient.ping();
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
