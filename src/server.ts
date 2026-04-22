import { env } from './config/env';
import { logger } from './utils/logger';
import app from './app';
import { pdfWorker } from './workers/pdf.worker';
import { closeBrowser } from './services/pdf.service';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `server listening on http://localhost:${PORT}`);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pdfWorker.close();
  await closeBrowser();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
