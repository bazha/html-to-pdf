import { Router } from 'express';
import { handlePDFRequest } from '../controllers/pdf.controller';

const router = Router();

router.post('/pdf', handlePDFRequest);

export default router;