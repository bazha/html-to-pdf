import { Router } from 'express';
import { generatePdf, getPdfUrlByJobId } from '../controllers/pdf.controller';
import { validateHtml } from '../middlewares/validate-html.middleware';

const router = Router();

router.post('/pdf', validateHtml, generatePdf);
router.get('/pdf/:jobId/url', getPdfUrlByJobId);

export default router;