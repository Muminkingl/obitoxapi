/**
 * Cloudflare R2 Provider - Main Entry Point
 * Exports all R2 operations
 */

// Primary operation (CRITICAL - 5-10ms pure crypto)
export { generateR2SignedUrl } from './r2.signed-url.js';

// Core file operations
export { deleteR2File } from './r2.delete.js';
export { downloadR2File } from './r2.download.js';
export { listR2Files } from './r2.list.js';

// Advanced features (Phase 2A - Security)
export { generateR2DownloadUrl } from './r2.download-url.js';
export { generateR2AccessToken, revokeR2AccessToken } from './r2.access-token.js';

// Advanced features (Phase 2B - Batch Operations)
export { generateR2BatchSignedUrls } from './r2.batch-signed-url.js';
export { batchDeleteR2Files } from './r2.batch-delete.js';

// Export helpers for advanced use
export {
    updateR2Metrics,
    logR2Upload,
    generateR2Filename,
    validateR2File
} from './r2.helpers.js';

// Export config
export {
    getR2Client,
    validateR2Credentials,
    buildPublicUrl,
    generateObjectKey
} from './r2.config.js';
