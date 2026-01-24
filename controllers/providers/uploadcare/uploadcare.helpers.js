/**
 * Uploadcare Storage Helper Functions
 * Shared utilities for validation and filename generation
 * 
 * OPTIMIZED: Removed legacy DB functions - use updateRequestMetrics from metrics.helper.js
 */

import {
    MAX_FILE_SIZE,
    ALLOWED_FILE_TYPES
} from './uploadcare.config.js';

/**
 * Log individual file upload (NO-OP - DEPRECATED)
 * @deprecated Tables file_uploads and api_requests have been deleted.
 *             Use updateRequestMetrics from metrics.helper.js instead.
 */
export const logFileUpload = async () => {
    // NO-OP: file_uploads and api_requests tables have been deleted
    return;
};

/**
 * Update file size for Uploadcare (NO-OP - DEPRECATED)
 * @deprecated This function made redundant DB calls.
 *             File size is now tracked via updateRequestMetrics.
 */
export const updateUploadcareFileSize = async () => {
    // NO-OP: This was making extra API + DB calls for data already tracked
    return;
};

/**
 * Update request metrics for Uploadcare (NO-OP - DEPRECATED)
 * @deprecated This function made 7+ DB calls per request!
 *             Use updateRequestMetrics from metrics.helper.js instead.
 *             That function uses Redis for 70% less DB load.
 */
export const updateUploadcareMetrics = async () => {
    // NO-OP: This was making 7 sequential DB calls
    // All metrics are now tracked via updateRequestMetrics (Redis-backed)
    return;
};

/**
 * Comprehensive file validation for Uploadcare
 */
export const validateFileForUploadcare = (filename, contentType, fileSize = 0) => {
    const errors = [];

    // Filename validation
    if (!filename || filename.trim() === '') {
        errors.push('Filename cannot be empty');
    } else if (filename.length > 255) {
        errors.push('Filename too long (max 255 characters)');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(filename.replace(/\s/g, '_'))) {
        errors.push('Filename contains invalid characters');
    }

    // File extension validation
    const hasExtension = filename && filename.includes('.');
    if (!hasExtension) {
        errors.push('File must have an extension');
    }

    // Content type validation
    if (!contentType) {
        errors.push('Content type is required');
    } else if (!ALLOWED_FILE_TYPES.includes(contentType)) {
        errors.push(`Unsupported file type: ${contentType}`);
    }

    // File size validation
    if (fileSize > MAX_FILE_SIZE) {
        errors.push(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Generate a secure unique filename for Uploadcare
 */
export const generateUploadcareFilename = (originalName, apiKey = null) => {
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
