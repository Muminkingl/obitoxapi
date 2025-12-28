/**
 * Uploadcare Storage Configuration
 * Provider-specific constants, limits, and helper functions
 */

// API Configuration
export const UPLOADCARE_API_BASE = 'https://api.uploadcare.com';
export const UPLOADCARE_CDN_BASE = 'https://ucarecdn.com';
export const UPLOAD_BASE_URL = 'https://upload.uploadcare.com/base/';

// File Size Limits
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (our service limit)
export const MIN_FILE_SIZE = 1; // 1 byte

// Allowed file types for Uploadcare
export const ALLOWED_FILE_TYPES = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'image/bmp', 'image/tiff',

    // Documents
    'application/pdf', 'text/plain', 'application/json', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',

    // Video
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',

    // Audio
    'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mpeg'
];

// Dangerous file types (for security)
export const DANGEROUS_FILE_TYPES = [
    'application/x-msdownload', 'application/x-sh', 'application/x-executable',
    'application/x-msdos-program', 'application/x-bat', 'text/x-script.python'
];

// Rate Limits (per minute)
export const RATE_LIMIT_PER_MINUTE = 60;
export const RATE_LIMIT_PER_HOUR = 1000;

// Quotas
export const MAX_FILES_PER_USER = 10000;
export const MAX_TOTAL_SIZE_PER_USER = 10 * 1024 * 1024 * 1024; // 10GB

/**
 * Format Uploadcare API response
 */
export const formatUploadcareResponse = (data) => {
    return {
        success: true,
        provider: 'uploadcare',
        data,
        timestamp: new Date().toISOString()
    };
};

/**
 * Get Uploadcare API headers
 */
export const getUploadcareHeaders = (publicKey, secretKey) => {
    return {
        'Authorization': `Uploadcare.Simple ${publicKey}:${secretKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.uploadcare-v0.7+json'
    };
};

/**
 * Validate Uploadcare credentials
 */
export const validateUploadcareCredentials = (publicKey, secretKey) => {
    if (!publicKey || !secretKey) {
        return {
            valid: false,
            error: 'MISSING_UPLOADCARE_CREDENTIALS',
            message: 'Uploadcare public key and secret key are required'
        };
    }

    if (typeof publicKey !== 'string' || typeof secretKey !== 'string') {
        return {
            valid: false,
            error: 'INVALID_CREDENTIALS_TYPE',
            message: 'Credentials must be strings'
        };
    }

    return { valid: true };
};

/**
 * Get file type category
 */
export const getFileTypeCategory = (contentType) => {
    if (!contentType) return 'unknown';

    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.includes('pdf')) return 'document';
    if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('7z')) return 'archive';

    return 'other';
};

/**
 * Get max allowed size based on file type
 */
export const getMaxAllowedSize = (contentType) => {
    const category = getFileTypeCategory(contentType);

    switch (category) {
        case 'image':
            return 50 * 1024 * 1024; // 50MB for images
        case 'video':
            return 100 * 1024 * 1024; // 100MB for videos
        case 'audio':
            return 50 * 1024 * 1024; // 50MB for audio
        case 'document':
            return 25 * 1024 * 1024; // 25MB for documents
        case 'archive':
            return 100 * 1024 * 1024; // 100MB for archives
        default:
            return MAX_FILE_SIZE; // Default to global max
    }
};

/**
 * Check if file type is dangerous
 */
export const isDangerousFileType = (contentType) => {
    return DANGEROUS_FILE_TYPES.some(dangerous => contentType.includes(dangerous));
};

/**
 * Extract UUID from Uploadcare URL
 */
export const extractUuidFromUrl = (url) => {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        return pathParts[1]; // UUID is the first path segment after domain
    } catch (error) {
        return null;
    }
};

/**
 * Build Uploadcare CDN URL
 */
export const buildCdnUrl = (uuid, transformations = '') => {
    if (!uuid) return null;

    if (transformations) {
        return `${UPLOADCARE_CDN_BASE}/${uuid}/-/${transformations}/`;
    }

    return `${UPLOADCARE_CDN_BASE}/${uuid}/`;
};
