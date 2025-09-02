import { Router } from 'express';
import { generateVercelSignedUrl, uploadToVercelBlob, generateDirectUploadUrl, trackUploadEvent } from '../controllers/upload.controller.js';
import apiKeyMiddleware from '../middlewares/apikey.middleware.js';

const uploadRouter = Router();

// Apply API key validation middleware to all upload routes
uploadRouter.use(apiKeyMiddleware);

// Main API endpoint - matches your planned architecture
// POST /upload/signed-url (as per your plan.md)
uploadRouter.post('/signed-url', generateVercelSignedUrl);

// Legacy endpoint for backward compatibility
uploadRouter.post('/vercel-signed-url', generateVercelSignedUrl);

// Server-side upload to Vercel Blob (alternative method)
uploadRouter.post('/vercel-upload', uploadToVercelBlob);

// Generate direct upload URL (alternative method)
uploadRouter.post('/vercel-direct-url', generateDirectUploadUrl);

export default uploadRouter;
