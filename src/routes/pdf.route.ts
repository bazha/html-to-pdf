import { Router } from 'express';
import { generatePdf, getPdfUrlByJobId } from '../controllers/pdf.controller';
import { validateContent } from '../middlewares/validate-content.middleware';

const router = Router();

for (const prefix of ['/pdf', '/markdown']) {
  router.post(prefix, validateContent, generatePdf);
  router.get(`${prefix}/:jobId/url`, getPdfUrlByJobId);
}

export default router;