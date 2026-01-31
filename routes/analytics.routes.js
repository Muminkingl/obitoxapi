import { Router } from 'express';
import { trackUploadcareEvent } from '../controllers/providers/uploadcare/index.js';
import apiKeyMiddleware from '../middlewares/apikey.middleware.js';

const analyticsRouter = Router();

// Apply API key validation middleware to all analytics routes
analyticsRouter.use(apiKeyMiddleware);

// Track upload events for dashboard analytics
// POST /analytics/track (as per your plan.md)
// Now uses Uploadcare's tracking since Vercel was removed
analyticsRouter.post('/track', trackUploadcareEvent);

export default analyticsRouter;
