import { Router } from 'express';
import { trackUploadEvent } from '../controllers/upload.controller.js';
import apiKeyMiddleware from '../middlewares/apikey.middleware.js';

const analyticsRouter = Router();

// Apply API key validation middleware to all analytics routes
analyticsRouter.use(apiKeyMiddleware);

// Track upload events for dashboard analytics
// POST /analytics/track (as per your plan.md)
analyticsRouter.post('/track', trackUploadEvent);

export default analyticsRouter;
