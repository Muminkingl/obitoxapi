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

// ✅ UPDATED: Import from modular Supabase structure
import {
  uploadToSupabaseStorage,
  generateSupabaseSignedUrl,
  deleteSupabaseFile,
  downloadSupabaseFile
} from '../controllers/providers/supabase/index.js';

// ⚠️ TODO: These are not yet extracted (using old controller for now)
// ✅ COMPLETE: All Supabase operations from modular structure
import {
  listSupabaseFiles,
  cancelSupabaseUpload,
  listSupabaseBuckets,
  completeSupabaseUpload
} from '../controllers/providers/supabase/index.js';

// ✅ COMPLETE: Import all from modular Uploadcare structure (with enterprise caching!)
import {
  generateUploadcareSignedUrl,
  deleteUploadcareFile,
  downloadUploadcareFile,
  cancelUploadcareUpload,
  listUploadcareFiles,
  scanUploadcareFileForMalware,
  checkUploadcareMalwareScanStatus,
  getUploadcareMalwareScanResults,
  removeUploadcareInfectedFile,
  validateUploadcareFile,
  getUploadcareProjectSettings,
  validateUploadcareSvg,
  uploadcareHealthCheck
} from '../controllers/providers/uploadcare/index.js';

// ✅ NEW: Import all from modular R2 structure (enterprise caching + pure crypto!)
import {
  generateR2SignedUrl,
  deleteR2File,
  downloadR2File,
  listR2Files,
  generateR2DownloadUrl,       // Phase 2A: Time-limited download URLs
  generateR2AccessToken,        // Phase 2A: JWT access tokens
  revokeR2AccessToken,          // Phase 2A: Token revocation
  generateR2BatchSignedUrls,    // Phase 2B: Batch signed URLs
  batchDeleteR2Files            // Phase 2B: Batch delete
} from '../controllers/providers/r2/index.js';

// R2 token validation middleware
import { validateR2AccessToken, requireR2Permission } from '../middlewares/r2-token.middleware.js';

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
router.post('/supabase/delete', validateApiKey, deleteSupabaseFile);

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

// ===== CLOUDFLARE R2 PROVIDER ROUTES =====

// Generate presigned URL for R2 upload (pure crypto - 5-10ms!)
router.post('/r2/signed-url', validateApiKey, generateR2SignedUrl);

// Delete files from R2
router.delete('/r2/delete', validateApiKey, deleteR2File);

// Get file info and download URL from R2
router.post('/r2/download', validateApiKey, downloadR2File);

// List files in R2 bucket
router.post('/r2/list', validateApiKey, listR2Files);

// ===== R2 ADVANCED FEATURES (Phase 2A) =====

// Generate time-limited download URL (presigned with expiry)
router.post('/r2/download-url', validateApiKey, generateR2DownloadUrl);

// Generate JWT access token for file/bucket access
router.post('/r2/access-token', validateApiKey, generateR2AccessToken);

// Revoke JWT access token
router.delete('/r2/access-token/revoke', validateApiKey, revokeR2AccessToken);

// ===== R2 BATCH OPERATIONS (Phase 2B) =====

// Generate batch signed URLs (up to 100 files)
router.post('/r2/batch/signed-urls', validateApiKey, generateR2BatchSignedUrls);

// Batch delete files (up to 1000 files)
router.delete('/r2/batch/delete', validateApiKey, batchDeleteR2Files);

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
