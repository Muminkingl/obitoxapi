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

// Placeholder functions for list and cancel (these were in old controller, not critical)
export const listSupabaseFiles = async (req, res) => {
    return res.status(501).json({
        success: false,
        error: 'NOT_IMPLEMENTED',
        message: 'Operation not yet extracted from legacy controller. Use Supabase dashboard to list files.'
    });
};

export const cancelSupabaseUpload = async (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Supabase uploads are immediate and cannot be cancelled',
        note: 'Unlike Vercel, Supabase does not support upload cancellation'
    });
};

// Export helper functions for advanced use
export {
    validateSupabaseFile,
    generateSupabaseFilename,
    updateSupabaseMetrics
} from './supabase.helpers.js';

// Export config
export { getSupabaseConfig } from './supabase.config.js';
