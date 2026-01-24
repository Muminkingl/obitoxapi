/**
 * Cloudflare R2 Helper Functions
 * Shared utilities for validation and filename generation
 * 
 * OPTIMIZED: Removed legacy DB functions - use updateRequestMetrics from metrics.helper.js
 */

/**
 * Update request metrics for R2 (NO-OP - DEPRECATED)
 * @deprecated This function made 7+ DB calls per request!
 *             Use updateRequestMetrics from metrics.helper.js instead.
 *             That function uses Redis for 70% less DB load.
 */
export const updateR2Metrics = async () => {
    // NO-OP: This was making 7 sequential DB calls
    // All metrics are now tracked via updateRequestMetrics (Redis-backed)
    return;
};

/**
 * Log individual file upload (NO-OP - DEPRECATED)
 * @deprecated Tables file_uploads and api_requests have been deleted.
 *             Use updateRequestMetrics from metrics.helper.js instead.
 */
export const logR2Upload = async () => {
    // NO-OP: file_uploads and api_requests tables have been deleted
    // Metrics are now tracked via Redis → api_keys, provider_usage, etc.
    return;
};

/**
 * Generate a secure unique filename for R2
 * Pattern: {apiKeyPrefix}_{sanitizedName}_{timestamp}_{random}.{ext}
 * 
 * @param {string} originalName - Original filename
 * @param {string} apiKey - API key (optional)
 * @returns {string} Unique filename
 */
export const generateR2Filename = (originalName, apiKey = null) => {
    try {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const extension = originalName.split('.').pop()?.toLowerCase() || 'bin';

        // Sanitize original name
        const baseName = originalName
            .split('.')[0]
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 50);

        // Add API key prefix for organization (first 8 chars)
        const keyPrefix = apiKey ? apiKey.substring(0, 8) : 'unknown';

        return `${keyPrefix}_${baseName}_${timestamp}_${randomSuffix}.${extension}`;
    } catch (error) {
        const timestamp = Date.now();
        return `file_${timestamp}.bin`;
    }
};

/**
 * Validate file for R2 upload
 * 
 * @param {string} filename - File name
 * @param {string} contentType - MIME type
 * @param {number} fileSize - File size in bytes
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export const validateR2File = (filename, contentType, fileSize = 0) => {
    const errors = [];

    // Filename validation
    if (!filename || filename.trim() === '') {
        errors.push('Filename cannot be empty');
    } else if (filename.length > 255) {
        errors.push('Filename too long (max 255 characters)');
    }

    // File extension validation
    const hasExtension = filename && filename.includes('.');
    if (!hasExtension) {
        errors.push('File must have an extension');
    }

    // Content type validation
    if (!contentType) {
        errors.push('Content type is required');
    }

    // File size validation (5GB R2 limit)
    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
    if (fileSize > MAX_SIZE) {
        errors.push(`File too large. Maximum size: 5GB`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};
