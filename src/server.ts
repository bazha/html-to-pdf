import express from 'express';
import pdfRoutes from './routes/pdf.routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use('/', pdfRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});