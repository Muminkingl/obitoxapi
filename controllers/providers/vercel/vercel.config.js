/**
 * Vercel Blob configuration
 * Configuration constants and utilities for Vercel Blob storage
 */

// File size limits
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (service limit)
export const VERCEL_BLOB_LIMIT = 4.5 * 1024 * 1024; // 4.5MB (Vercel per-request limit)

// Allowed file types
export const ALLOWED_FILE_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'application/json', 'text/csv',
    'application/zip', 'video/mp4', 'audio/mpeg', 'audio/wav'
];

/**
 * Get Vercel Blob configuration
 * @returns {Object} configuration
 */
export const getVercelConfig = () => {
    return {
        maxFileSize: MAX_FILE_SIZE,
        vercelBlobLimit: VERCEL_BLOB_LIMIT,
        allowedTypes: ALLOWED_FILE_TYPES,
        uploadTimeout: 60000, // 60 seconds
        access: 'public' // Default access level
    };
};

/**
 * Format Vercel response
 * @param {Object} blob - Vercel blob response
 * @param {string} originalFilename 
 * @param {string} contentType 
 * @returns {Object} formatted response
 */
export const formatVercelResponse = (blob, originalFilename, contentType) => {
    return {
        success: true,
        data: {
            url: blob.url,
            downloadUrl: blob.downloadUrl,
            pathname: blob.pathname,
            contentType: blob.contentType || contentType,
            contentDisposition: blob.contentDisposition,
            originalFilename
        },
        provider: 'vercel'
    };
};
