import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { generatePdf, getPdfUrlByJobId } from '../controllers/pdf.controller';
import { validateContent } from '../middlewares/validate-content.middleware';

const generateRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many PDF generation requests' },
});

const router = Router();

for (const prefix of ['/pdf', '/markdown']) {
  router.post(prefix, generateRateLimit, validateContent, generatePdf);
  router.get(`${prefix}/:jobId/url`, getPdfUrlByJobId);
}

export default router;