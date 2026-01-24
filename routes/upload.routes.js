import express from 'express';
import multer from 'multer';
import validateApiKey from '../middlewares/apikey.middleware.js';
import { signatureValidator } from '../middlewares/signature-validator.middleware.js';

// ✅ UNIFIED RATE LIMITER (replaces 4 conflicting middlewares!)
import { unifiedRateLimitMiddleware } from '../middlewares/rate-limiter.middleware.js';

// ✅ NEW: Import from modular Vercel structure
import {
  generateVercelSignedUrl,
  uploadToVercelBlob,
  trackUploadEvent,
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
  listUploadcareFiles,
  scanUploadcareFileForMalware,
  checkUploadcareMalwareScanStatus,
  getUploadcareMalwareScanResults,
  removeUploadcareInfectedFile,
  validateUploadcareFile,
  getUploadcareProjectSettings,
  validateUploadcareSvg,
  uploadcareHealthCheck,
  trackUploadcareEvent  // ✅ Redis-based tracking (NO deprecated tables)
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

// ✅ NEW: Import S3 controller (AWS S3 with multi-region + storage classes)
import { generateS3SignedUrl } from '../controllers/providers/s3/s3.signed-url.js';

// ✅ NEW: Import S3 Multipart controllers (Phase 2C - for files >100MB)
import {
  initiateS3MultipartUpload,
  completeS3MultipartUpload,
  abortS3MultipartUpload
} from '../controllers/providers/s3/s3.multipart.js';

// ✅ NEW: Import S3 Download controller
import { generateS3DownloadUrl } from '../controllers/providers/s3/s3.download.js';

// ✅ NEW: Import S3 Delete controller
import { deleteS3File, batchDeleteS3Files } from '../controllers/providers/s3/s3.delete.js';

// ✅ NEW: Import S3 List controller
import { listS3Files } from '../controllers/providers/s3/s3.list.js';

// ✅ NEW: Import S3 Metadata controller
import { getS3Metadata } from '../controllers/providers/s3/s3.metadata.js';

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
// NOW WITH PHASE 2: Combined middleware (370ms → 80ms!) 🚀
router.post('/vercel/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateVercelSignedUrl);

// Direct upload to Vercel Blob (alternative approach)
router.post('/vercel/upload', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, upload.single('file'), uploadToVercelBlob);

// Track upload events for analytics
router.post('/vercel/track', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, trackUploadEvent);

// Vercel Blob provider routes
// Health check removed - use main /health endpoint instead

// Delete files from Vercel Blob
router.delete('/vercel/delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, deleteVercelFile);

// Download files from Vercel Blob
router.post('/vercel/download', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, downloadVercelFile);

// Complete Vercel upload and update metrics
router.post('/vercel/complete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, completeVercelUpload);

// ===== SUPABASE PROVIDER ROUTES =====

// Generate signed URL for Supabase Storage
router.post('/supabase/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateSupabaseSignedUrl);

// Direct upload to Supabase Storage
router.post('/supabase/upload', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, uploadToSupabaseStorage);

// Cancel Supabase Storage uploads
router.post('/supabase/cancel', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, cancelSupabaseUpload);

// Delete files from Supabase Storage
router.post('/supabase/delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, deleteSupabaseFile);

// List files in Supabase Storage
router.post('/supabase/list', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, listSupabaseFiles);

// Download files from Supabase Storage (public or private)
router.post('/supabase/download', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, downloadSupabaseFile);

// List available buckets in Supabase Storage
router.post('/supabase/buckets', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, listSupabaseBuckets);

// Complete Supabase upload and update metrics
router.post('/supabase/complete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, completeSupabaseUpload);

// ===== UPLOADCARE PROVIDER ROUTES =====

// Generate signed URL for Uploadcare (zero bandwidth cost)
router.post('/uploadcare/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateUploadcareSignedUrl);



// Delete files from Uploadcare
router.delete('/uploadcare/delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, deleteUploadcareFile);

// Download files from Uploadcare
router.post('/uploadcare/download', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, downloadUploadcareFile);

// List files from Uploadcare
router.post('/uploadcare/list', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, listUploadcareFiles);

// Uploadcare provider health check
router.get('/uploadcare/health', uploadcareHealthCheck);

// Uploadcare malware scanning routes
router.post('/uploadcare/scan-malware', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, scanUploadcareFileForMalware);
router.post('/uploadcare/scan-status', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, checkUploadcareMalwareScanStatus);
router.post('/uploadcare/scan-results', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getUploadcareMalwareScanResults);
router.post('/uploadcare/remove-infected', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, removeUploadcareInfectedFile);

// Uploadcare validation routes
router.post('/uploadcare/validate', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, validateUploadcareFile);
router.post('/uploadcare/project-settings', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getUploadcareProjectSettings);
router.post('/uploadcare/validate-svg', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, validateUploadcareSvg);

// ✅ NEW: Uploadcare tracking endpoint (uses Redis metrics - NO deprecated tables)
router.post('/uploadcare/track', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, trackUploadcareEvent);

// ===== CLOUDFLARE R2 PROVIDER ROUTES =====

// Generate presigned URL for R2 upload (pure crypto - 5-10ms!)
router.post('/r2/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateR2SignedUrl);

// Delete files from R2
router.delete('/r2/delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, deleteR2File);

// Get file info and download URL from R2
router.post('/r2/download', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, downloadR2File);

// List files in R2 bucket
router.post('/r2/list', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, listR2Files);

// ===== R2 ADVANCED FEATURES (Phase 2A) =====

// Generate time-limited download URL (presigned with expiry)
router.post('/r2/download-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateR2DownloadUrl);

// Generate JWT access token for file / bucket access
router.post('/r2/access-token', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateR2AccessToken);

// Revoke JWT access token
router.delete('/r2/access-token/revoke', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, revokeR2AccessToken);

// ===== R2 BATCH OPERATIONS (Phase 2B) =====

// Generate batch signed URLs (up to 100 files)
router.post('/r2/batch/signed-urls', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateR2BatchSignedUrls);

// Batch delete files (up to 1000 files)
router.delete('/r2/batch/delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, batchDeleteR2Files);

// ===== AWS S3 PROVIDER ROUTES (Phase 1: Enterprise Support) =====

// Generate signed URL for S3 upload (multi-region + storage classes + SSE-S3)
router.post('/s3/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateS3SignedUrl);

// ===== AWS S3 MULTIPART ROUTES (Phase 2C: Large Files >100MB) =====

// Initiate multipart upload (returns uploadId + part URLs)
router.post('/s3/multipart/initiate', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, initiateS3MultipartUpload);

// Complete multipart upload (finalizes upload)
router.post('/s3/multipart/complete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, completeS3MultipartUpload);

// Abort multipart upload (cleanup)
router.post('/s3/multipart/abort', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, abortS3MultipartUpload);

// ===== AWS S3 DOWNLOAD ROUTE =====

// Generate presigned download URL
router.post('/download/s3/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateS3DownloadUrl);

// ===== AWS S3 DELETE ROUTES =====

// Delete single file
router.delete('/s3/delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, deleteS3File);

// Batch delete (up to 1000 files)
router.post('/s3/batch-delete', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, batchDeleteS3Files);

// ===== AWS S3 LIST ROUTE =====

// List files with pagination
router.post('/s3/list', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, listS3Files);

// ===== AWS S3 METADATA ROUTE =====

// Get file metadata without downloading
router.post('/s3/metadata', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getS3Metadata);

// ===== LEGACY ROUTES (for backward compatibility) =====

// Legacy signed URL endpoint (redirects to Vercel)
router.post('/signed-url', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, generateVercelSignedUrl);

// Legacy upload endpoint (redirects to Vercel)
router.post('/upload', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, upload.single('file'), uploadToVercelBlob);

// ===== ANALYTICS & TRACKING =====

// Track any upload event
router.post('/track', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, trackUploadEvent);

// Get comprehensive upload analytics with all filter support
router.get('/analytics', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getUploadAnalytics);

// Get daily usage analytics
router.get('/analytics/daily', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getDailyUsageAnalytics);

// Get provider usage analytics
router.get('/analytics/providers', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getProviderUsageAnalytics);

// Get file type distribution analytics
router.get('/analytics/file-types', validateApiKey, unifiedRateLimitMiddleware, signatureValidator, getFileTypeAnalytics);

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
