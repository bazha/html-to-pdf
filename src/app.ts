import express from 'express';
import pdfRoutes from './routes/pdf.route';
import { errorHandler } from './middlewares/error-handler';
import { setupQueueDashboard } from './monitoring/queues/bull-board';
import 'dotenv/config';
 
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use('/', pdfRoutes);
app.use(errorHandler);
setupQueueDashboard(app);

export default app;