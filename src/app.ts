import express from 'express';
import pdfRoutes from './routes/pdf.routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use('/', pdfRoutes);
app.use(errorHandler);

export default app;