import { env } from './config/env';
import app from './app';
import { pdfWorker } from './workers/pdf.worker';
import { closeBrowser } from './services/pdf.service';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pdfWorker.close();
  await closeBrowser();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));