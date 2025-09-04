import express from 'express';
import multer from 'multer';
import validateApiKey from '../middlewares/apikey.middleware.js';
import { 
  generateVercelSignedUrl, 
  uploadToVercelBlob, 
  trackUploadEvent, 
  vercelHealthCheck,
  cancelVercelUpload,
  deleteVercelFile,
  downloadVercelFile
} from '../controllers/providers/vercel.controller.js';
import {
  uploadToSupabaseStorage,
  generateSupabaseSignedUrl,
  deleteSupabaseFile,
  listSupabaseFiles,
  cancelSupabaseUpload,
  downloadSupabaseFile,
  listSupabaseBuckets
} from '../controllers/providers/supabase.controller.js';

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

// Cancel ongoing uploads
router.post('/vercel/cancel', validateApiKey, cancelVercelUpload);

// Delete files from Vercel Blob
router.delete('/vercel/delete', validateApiKey, deleteVercelFile);

// Download files from Vercel Blob
router.post('/vercel/download', validateApiKey, downloadVercelFile);

// ===== SUPABASE PROVIDER ROUTES =====

// Generate signed URL for Supabase Storage
router.post('/supabase/signed-url', validateApiKey, generateSupabaseSignedUrl);

// Direct upload to Supabase Storage
router.post('/supabase/upload', validateApiKey, uploadToSupabaseStorage);

// Cancel Supabase Storage uploads
router.post('/supabase/cancel', validateApiKey, cancelSupabaseUpload);

// Delete files from Supabase Storage
router.delete('/supabase/delete', validateApiKey, deleteSupabaseFile);

// List files in Supabase Storage
router.get('/supabase/list', validateApiKey, listSupabaseFiles);

// Download files from Supabase Storage (public or private)
router.post('/supabase/download', validateApiKey, downloadSupabaseFile);

// List available buckets in Supabase Storage
router.post('/supabase/buckets', validateApiKey, listSupabaseBuckets);

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
