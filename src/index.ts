export { default } from './client';
export * from './client';
export * from './types/common.js';
export { validateFile, quickValidate, readMagicBytes, detectMimeType, sanitizeFilename, getFileExtension, isDangerousExtension, formatFileSize, isImage, isVideo, isAudio } from './utils/file-validator';

// ✅ ADDED: Webhook signature verification for customers
export {
  verifyWebhookSignature,
  parseWebhookPayload,
  createWebhookSignature,
  type WebhookPayload,
  type WebhookEventType
} from './utils/webhook-verifier';

// ✅ ADDED: Network detector for smart expiry
export {
  getNetworkInfo,
  normalizeNetworkInfo,
  estimateNetworkSpeed,
  getNetworkLabel,
  type NetworkInfo
} from './utils/network-detector';

// ============================================================================
// Provider Exports (for advanced usage)
// ============================================================================

/**
 * Direct R2Provider export for advanced usage
 * 
 * @example
 * ```typescript
 * import { R2Provider } from '@obitox/sdk';
 * 
 * const r2 = new R2Provider({
 *   accessKey: process.env.R2_ACCESS_KEY,
 *   secretKey: process.env.R2_SECRET_KEY,
 *   accountId: process.env.R2_ACCOUNT_ID,
 *   bucket: 'my-uploads'
 * });
 * 
 * await r2.uploadFile(file);
 * ```
 */
export { R2Provider } from './providers/r2/r2.provider.js';
export type { R2Config } from './types/r2.types.js';

/**
 * Direct S3Provider export for advanced usage
 */
export { S3Provider } from './providers/s3/s3.provider.js';
export type { S3Config } from './types/s3.types.js';

/**
 * Direct SupabaseProvider export for advanced usage
 */
export { SupabaseProvider } from './providers/supabase/supabase.provider.js';
export type { SupabaseConfig } from './types/supabase.types.js';

/**
 * Direct UploadcareProvider export for advanced usage
 */
export { UploadcareProvider } from './providers/uploadcare/uploadcare.provider.js';
export type { UploadcareConfig } from './types/uploadcare.types.js';