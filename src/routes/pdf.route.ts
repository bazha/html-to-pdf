import { Router } from 'express';
import { PDFController } from '../controllers/pdf.controller';
import { validateHtml } from '../middlewares/validate-html.middleware';

const router = Router();

router.post('/pdf', validateHtml, PDFController);

export default router;