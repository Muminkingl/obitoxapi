/**
 * File validation helper
 * Validates filename, content type, and file size
 */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (service limit)
const VERCEL_BLOB_LIMIT = 4.5 * 1024 * 1024; // 4.5MB (Vercel per-request limit)

const ALLOWED_FILE_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'application/json', 'text/csv',
    'application/zip', 'video/mp4', 'audio/mpeg', 'audio/wav'
];

/**
 * Validate file input
 * @param {string} filename 
 * @param {string} contentType 
 * @param {number} fileSize 
 * @returns {Object} validation result
 */
export const validateFileInput = (filename, contentType, fileSize = 0) => {
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
        errors.push(`Unsupported file type: ${contentType}. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`);
    }

    // File size validation
    if (fileSize > MAX_FILE_SIZE) {
        errors.push(`File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        limits: {
            maxFileSize: MAX_FILE_SIZE,
            vercelBlobLimit: VERCEL_BLOB_LIMIT,
            allowedTypes: ALLOWED_FILE_TYPES
        }
    };
};

/**
 * Validate Vercel token format
 * @param {string} token 
 * @returns {Object} validation result
 */
export const validateVercelToken = (token) => {
    if (!token) {
        return { isValid: false, error: 'Vercel token is required' };
    }

    if (typeof token !== 'string') {
        return { isValid: false, error: 'Vercel token must be a string' };
    }

    if (!token.startsWith('vercel_blob_rw_')) {
        return { isValid: false, error: 'Invalid token format. Must start with "vercel_blob_rw_"' };
    }

    if (token.length < 50) {
        return { isValid: false, error: 'Vercel token appears incomplete' };
    }

    return { isValid: true };
};

/**
 * Check if file size exceeds Vercel Blob limit
 * @param {number} fileSize 
 * @returns {Object}
 */
export const checkVercelSizeLimit = (fileSize) => {
    if (fileSize > VERCEL_BLOB_LIMIT) {
        return {
            exceeds: true,
            message: `File exceeds Vercel Blob limit of ${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
            maxSize: VERCEL_BLOB_LIMIT,
            currentSize: fileSize
        };
    }

    return { exceeds: false };
};

export { MAX_FILE_SIZE, VERCEL_BLOB_LIMIT, ALLOWED_FILE_TYPES };
