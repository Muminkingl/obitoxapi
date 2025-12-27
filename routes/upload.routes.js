import express from 'express';
import multer from 'multer';
import validateApiKey from '../middlewares/apikey.middleware.js';

// ✅ NEW: Import from modular Vercel structure
import {
  generateVercelSignedUrl,
  uploadToVercelBlob,
  trackUploadEvent,
  cancelVercelUpload,
  deleteVercelFile,
  downloadVercelFile,
  completeVercelUpload
} from '../controllers/providers/vercel/index.js';

import {
  uploadToSupabaseStorage,
  generateSupabaseSignedUrl,
  deleteSupabaseFile,
  listSupabaseFiles,
  cancelSupabaseUpload,
  downloadSupabaseFile,
  listSupabaseBuckets,
  completeSupabaseUpload
} from '../controllers/providers/supabase.controller.js';
import {
  generateUploadcareSignedUrl,
  deleteUploadcareFile,
  downloadUploadcareFile,
  cancelUploadcareUpload,
  listUploadcareFiles,
  uploadcareHealthCheck,
  scanUploadcareFileForMalware,
  checkUploadcareMalwareScanStatus,
  getUploadcareMalwareScanResults,
  removeUploadcareInfectedFile,
  validateUploadcareFile,
  getUploadcareProjectSettings,
  validateUploadcareSvg
} from '../controllers/providers/uploadcare.controller.js';
import {
  getUploadAnalytics,
  getDailyUsageAnalytics,
  getProviderUsageAnalytics,
  getFileTypeAnalytics
} from '../controllers/analytics.controller.js';

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

// Vercel Blob provider routes
// Health check removed - use main /health endpoint instead

// Cancel ongoing uploads
router.post('/vercel/cancel', validateApiKey, cancelVercelUpload);

// Delete files from Vercel Blob
router.delete('/vercel/delete', validateApiKey, deleteVercelFile);

// Download files from Vercel Blob
router.post('/vercel/download', validateApiKey, downloadVercelFile);

// Complete Vercel upload and update metrics
router.post('/vercel/complete', validateApiKey, completeVercelUpload);

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
router.post('/supabase/list', validateApiKey, listSupabaseFiles);

// Download files from Supabase Storage (public or private)
router.post('/supabase/download', validateApiKey, downloadSupabaseFile);

// List available buckets in Supabase Storage
router.post('/supabase/buckets', validateApiKey, listSupabaseBuckets);

// Complete Supabase upload and update metrics
router.post('/supabase/complete', validateApiKey, completeSupabaseUpload);

// ===== UPLOADCARE PROVIDER ROUTES =====

// Generate signed URL for Uploadcare (zero bandwidth cost)
router.post('/uploadcare/signed-url', validateApiKey, generateUploadcareSignedUrl);

// Cancel Uploadcare uploads (not applicable - uploads are immediate)
router.post('/uploadcare/cancel', validateApiKey, cancelUploadcareUpload);

// Delete files from Uploadcare
router.delete('/uploadcare/delete', validateApiKey, deleteUploadcareFile);

// Download files from Uploadcare
router.post('/uploadcare/download', validateApiKey, downloadUploadcareFile);

// List files from Uploadcare
router.post('/uploadcare/list', validateApiKey, listUploadcareFiles);

// Uploadcare provider health check
router.get('/uploadcare/health', uploadcareHealthCheck);

// Uploadcare malware scanning routes
router.post('/uploadcare/scan-malware', validateApiKey, scanUploadcareFileForMalware);
router.post('/uploadcare/scan-status', validateApiKey, checkUploadcareMalwareScanStatus);
router.post('/uploadcare/scan-results', validateApiKey, getUploadcareMalwareScanResults);
router.post('/uploadcare/remove-infected', validateApiKey, removeUploadcareInfectedFile);

// Uploadcare validation routes
router.post('/uploadcare/validate', validateApiKey, validateUploadcareFile);
router.post('/uploadcare/project-settings', validateApiKey, getUploadcareProjectSettings);
router.post('/uploadcare/validate-svg', validateApiKey, validateUploadcareSvg);

// ===== LEGACY ROUTES (for backward compatibility) =====

// Legacy signed URL endpoint (redirects to Vercel)
router.post('/signed-url', validateApiKey, generateVercelSignedUrl);

// Legacy upload endpoint (redirects to Vercel)
router.post('/upload', validateApiKey, upload.single('file'), uploadToVercelBlob);

// ===== ANALYTICS & TRACKING =====

// Track any upload event
router.post('/track', validateApiKey, trackUploadEvent);

// Get comprehensive upload analytics with all filter support
router.get('/analytics', validateApiKey, getUploadAnalytics);

// Get daily usage analytics
router.get('/analytics/daily', validateApiKey, getDailyUsageAnalytics);

// Get provider usage analytics
router.get('/analytics/providers', validateApiKey, getProviderUsageAnalytics);

// Get file type distribution analytics
router.get('/analytics/file-types', validateApiKey, getFileTypeAnalytics);

// Legacy stats endpoint (for backward compatibility)
router.get('/stats', validateApiKey, async (req, res) => {
  try {
    // Redirect to new analytics endpoint
    res.json({
      success: true,
      message: 'This endpoint is deprecated. Use /analytics instead.',
      redirect: '/api/v1/upload/analytics',
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
