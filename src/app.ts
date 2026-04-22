import express from 'express';
import pdfRoutes from './routes/pdf.route';
import { errorHandler } from './middlewares/error-handler';
import { requestContext } from './middlewares/request-context.middleware';
import { setupQueueDashboard } from './monitoring/queues/bull-board';

const app = express();

app.use(requestContext);
app.use(express.json({ limit: '10mb' }));
app.use('/', pdfRoutes);
app.use(errorHandler);
setupQueueDashboard(app);

export default app;
