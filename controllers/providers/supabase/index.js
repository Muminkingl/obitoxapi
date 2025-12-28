/**
 * Supabase Storage Module
 * Main entry point - exports all Supabase operations
 */

export { uploadToSupabaseStorage } from './supabase.upload.js';
export { generateSupabaseSignedUrl } from './supabase.signed-url.js';
export { deleteSupabaseFile } from './supabase.delete.js';
export { downloadSupabaseFile } from './supabase.download.js';

// Additional operations  
export { completeSupabaseUpload } from './supabase.complete.js';
export { listSupabaseBuckets } from './supabase.buckets.js';

// List and cancel (TODO: extract these if they exist elsewhere)
export { listSupabaseFiles, cancelSupabaseUpload } from '../supabase.controller.js';

// Export helper functions for advanced use
export {
    validateSupabaseFile,
    generateSupabaseFilename,
    updateSupabaseMetrics
} from './supabase.helpers.js';

// Export config
export { getSupabaseConfig } from './supabase.config.js';
