import { env } from './config/env';
import { logger } from './utils/logger';
import app from './app';
import { pdfWorker } from './workers/pdf.worker';
import { closeBrowser } from './services/pdf.service';
import { pdfQueue } from './queues/queue';
import { redisClient } from './config/redis.config';

const PORT = env.PORT;
// Must exceed JOB_TIMEOUT_MS in pdf.worker so an in-flight job can finish
// before the process exits. 90s = 75s job timeout + 15s for cleanup.
const SHUTDOWN_TIMEOUT_MS = 90_000;

const server = app.listen(PORT, () => {
  logger.info(
    { port: PORT, url: `http://localhost:${PORT}` },
    '[Server][start] listening',
  );
});

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '[Server][shutdown] received signal');

  const work = (async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pdfWorker.close().catch((err) => {
      logger.warn({ err }, '[Server][shutdown] pdfWorker.close() failed');
    });
    await pdfQueue.close().catch((err) => {
      logger.warn({ err }, '[Server][shutdown] pdfQueue.close() failed');
    });
    await closeBrowser().catch((err) => {
      logger.warn({ err }, '[Server][shutdown] closeBrowser() failed');
    });
    await redisClient.quit().catch((err) => {
      logger.warn({ err }, '[Server][shutdown] redisClient.quit() failed');
    });
  })();

  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), SHUTDOWN_TIMEOUT_MS),
  );

  const result = await Promise.race([work.then(() => 'ok' as const), timeout]);
  if (result === 'timeout') {
    logger.error(
      { timeoutMs: SHUTDOWN_TIMEOUT_MS },
      '[Server][shutdown] timed out, forcing exit',
    );
    process.exit(1);
  }
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[Server][unhandledRejection]');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[Server][uncaughtException]');
  // Pino writes can be buffered (SonicBoom). Force a sync flush so the fatal
  // line lands on stdout before the process exits. flushSync lives on the
  // destination and isn't on the public Logger type.
  (logger as unknown as { flushSync?: () => void }).flushSync?.();
  // After uncaughtException the process is in an undefined state — exit.
  process.exit(1);
});
