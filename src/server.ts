import { env } from './config/env';
import { logger } from './utils/logger';
import app from './app';
import { pdfWorker } from './workers/pdf.worker';
import { closeBrowser } from './services/pdf.service';

const PORT = env.PORT;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `server listening on http://localhost:${PORT}`);
});

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const work = (async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pdfWorker.close().catch((err) => {
      logger.warn({ err }, 'pdfWorker.close() failed during shutdown');
    });
    await closeBrowser().catch((err) => {
      logger.warn({ err }, 'closeBrowser() failed during shutdown');
    });
  })();

  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), SHUTDOWN_TIMEOUT_MS),
  );

  const result = await Promise.race([work.then(() => 'ok' as const), timeout]);
  if (result === 'timeout') {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out, forcing exit');
    process.exit(1);
  }
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  // After uncaughtException the process is in an undefined state — exit.
  process.exit(1);
});
