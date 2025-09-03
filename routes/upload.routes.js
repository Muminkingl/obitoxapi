import express from 'express';
import multer from 'multer';
import validateApiKey from '../middlewares/apikey.middleware.js';
import { 
  generateVercelSignedUrl, 
  uploadToVercelBlob, 
  trackUploadEvent, 
  vercelHealthCheck 
} from '../controllers/providers/vercel.controller.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now, validation happens in controller
    cb(null, true);
  }
});

// ===== VERCEL PROVIDER ROUTES =====

// Generate signed URL for Vercel Blob (recommended approach)
router.post('/vercel/signed-url', validateApiKey, generateVercelSignedUrl);

// Direct upload to Vercel Blob (alternative approach)
router.post('/vercel/upload', validateApiKey, upload.single('file'), uploadToVercelBlob);

// Track upload events for analytics
router.post('/vercel/track', validateApiKey, trackUploadEvent);

// Vercel provider health check
router.get('/vercel/health', vercelHealthCheck);

// ===== LEGACY ROUTES (for backward compatibility) =====

// Legacy signed URL endpoint (redirects to Vercel)
router.post('/signed-url', validateApiKey, generateVercelSignedUrl);

// Legacy upload endpoint (redirects to Vercel)
router.post('/upload', validateApiKey, upload.single('file'), uploadToVercelBlob);

// ===== ANALYTICS & TRACKING =====

// Track any upload event
router.post('/track', validateApiKey, trackUploadEvent);

// Get upload statistics for the current API key
router.get('/stats', validateApiKey, async (req, res) => {
  try {
    // This would typically fetch from your analytics tables
    res.json({
      success: true,
      message: 'Upload statistics endpoint - implement based on your analytics needs',
      apiKeyId: req.apiKeyId,
      userId: req.userId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload statistics'
    });
  }
});

export default router;
