/**
 * Cloudflare R2 Storage Configuration
 * S3-compatible provider with pure cryptographic signing (NO external API calls)
 * 
 * Performance Target: 5-10ms response time
 * Architecture: AWS SDK v3 for pure crypto signing (zero network calls)
 */

import { S3Client } from '@aws-sdk/client-s3';

// ============================================================================
// API Configuration
// ============================================================================

/**
 * R2 endpoint pattern
 * Format: https://{accountId}.r2.cloudflarestorage.com
 */
export const getR2Endpoint = (accountId) => {
    return `https://${accountId}.r2.cloudflarestorage.com`;
};

/**
 * R2 public URL pattern
 * Format: https://pub-{accountId}.r2.dev
 * Note: Requires public bucket configuration in Cloudflare dashboard
 */
export const getR2PublicUrl = (accountId) => {
    return `https://pub-${accountId}.r2.dev`;
};

// ============================================================================
// File Size Limits
// ============================================================================

export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB (R2 limit per object)
export const MIN_FILE_SIZE = 1; // 1 byte
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB (use multipart upload above this)

// ============================================================================
// Signed URL Configuration
// ============================================================================

export const SIGNED_URL_EXPIRY = 3600; // 1 hour default (seconds)
export const MAX_EXPIRY = 604800; // 7 days maximum (R2 limit, seconds)
export const MIN_EXPIRY = 60; // 1 minute minimum (seconds)

// ============================================================================
// Rate Limits  
// ============================================================================

export const RATE_LIMIT_PER_MINUTE = 100; // Conservative limit
export const RATE_LIMIT_PER_HOUR = 5000;

// ============================================================================
// Credential Validation (FORMAT ONLY - NO API CALLS)
// ============================================================================

/**
 * Validate R2 credentials (FORMAT validation only, 1ms)
 * Following Rule #2: NEVER call Cloudflare API to validate
 * Let R2 validate naturally at upload time (returns 403 if invalid)
 * 
 * @param {string} accessKey - R2 Access Key (~20 chars)
 * @param {string} secretKey - R2 Secret Key (~40 chars)
 * @param {string} accountId - R2 Account ID (32 chars hex)
 * @param {string} bucket - Bucket name
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateR2Credentials = (accessKey, secretKey, accountId, bucket) => {
    // Check all required fields
    if (!accessKey || !secretKey || !accountId || !bucket) {
        return {
            valid: false,
            error: 'MISSING_R2_CREDENTIALS',
            message: 'R2 Access Key ID, Secret Access Key, Account ID, and Bucket are all required',
            hint: 'Get your R2 credentials from: Cloudflare Dashboard → R2 → Manage R2 API Tokens'
        };
    }

    // Type validation
    if (typeof accessKey !== 'string' || typeof secretKey !== 'string' ||
        typeof accountId !== 'string' || typeof bucket !== 'string') {
        return {
            valid: false,
            error: 'INVALID_CREDENTIALS_TYPE',
            message: 'All R2 credentials must be strings'
        };
    }

    // Access Key format (typically 20 characters, alphanumeric)
    if (accessKey.length < 16 || accessKey.length > 128) {
        return {
            valid: false,
            error: 'INVALID_ACCESS_KEY_FORMAT',
            message: 'R2 Access Key ID must be between 16-128 characters',
            hint: 'Check your Access Key ID in Cloudflare Dashboard → R2 → API Tokens'
        };
    }

    // Secret Key format (typically 40 characters)
    if (secretKey.length < 32 || secretKey.length > 128) {
        return {
            valid: false,
            error: 'INVALID_SECRET_KEY_FORMAT',
            message: 'R2 Secret Access Key must be between 32-128 characters',
            hint: 'Your Secret Access Key is shown only once when created. Make sure you saved it correctly.'
        };
    }

    // Account ID format (32 character hex string)
    if (!/^[a-f0-9]{32}$/.test(accountId)) {
        return {
            valid: false,
            error: 'INVALID_ACCOUNT_ID_FORMAT',
            message: 'R2 Account ID must be a 32-character hexadecimal string',
            hint: 'Find your Account ID in Cloudflare Dashboard → R2 (it\'s in the URL and bucket creation page)'
        };
    }

    // Bucket name format (S3-compatible naming rules)
    // 3-63 characters, lowercase, numbers, hyphens
    const bucketRegex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
    if (!bucketRegex.test(bucket)) {
        return {
            valid: false,
            error: 'INVALID_BUCKET_NAME',
            message: 'R2 bucket name must be 3-63 characters, lowercase letters, numbers, and hyphens only',
            hint: 'Bucket names must start and end with a letter or number'
        };
    }

    // ✅ All format validations passed
    return { valid: true };
};

// ============================================================================
// S3Client Factory (Pure Crypto - NO API CALLS)
// ============================================================================

/**
 * Create configured S3Client for R2
 * This client is used for pure cryptographic operations (signing URLs)
 * NO network calls are made when creating the client or signing URLs
 * 
 * Following Rule #1: NO external API calls in request path
 * 
 * @param {string} accountId - R2 Account ID
 * @param {string} accessKey - R2 Access Key
 * @param {string} secretKey - R2 Secret Key
 * @returns {S3Client} Configured S3 client for R2
 */
export const getR2Client = (accountId, accessKey, secretKey) => {
    return new S3Client({
        region: 'auto', // R2 uses 'auto' region
        endpoint: getR2Endpoint(accountId),
        credentials: {
            accessKeyId: accessKey,      // AWS SDK still uses accessKeyId internally
            secretAccessKey: secretKey   // AWS SDK still uses secretAccessKey internally
        },
        // Performance optimizations
        maxAttempts: 3,
        requestHandler: {
            connectionTimeout: 3000,
            socketTimeout: 3000
        }
    });
};

// ============================================================================
// URL Building Helpers
// ============================================================================

/**
 * Build public URL for uploaded file
 * 
 * @param {string} accountId - R2 Account ID
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key (filename)
 * @param {string} customDomain - Optional custom domain
 * @returns {string} Public URL
 */
export const buildPublicUrl = (accountId, bucket, key, customDomain = null) => {
    if (customDomain) {
        // Remove trailing slash from custom domain to prevent double slashes
        const cleanDomain = customDomain.replace(/\/+$/, '');
        return `${cleanDomain}/${key}`;
    }

    // Default R2 public URL (requires public bucket configuration)
    return `${getR2PublicUrl(accountId)}/${key}`;
};

/**
 * Generate unique object key (filename)
 * Pattern: {timestamp}_{random}_{original-filename}
 * 
 * @param {string} originalFilename - Original file name
 * @returns {string} Unique object key
 */
export const generateObjectKey = (originalFilename) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${timestamp}_${random}_${sanitized}`;
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate signed URL expiry time
 * 
 * @param {number} expiresIn - Expiry time in seconds
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateExpiry = (expiresIn) => {
    if (expiresIn < MIN_EXPIRY) {
        return {
            valid: false,
            error: 'EXPIRY_TOO_SHORT',
            message: `Expiry time must be at least ${MIN_EXPIRY} seconds (1 minute)`
        };
    }

    if (expiresIn > MAX_EXPIRY) {
        return {
            valid: false,
            error: 'EXPIRY_TOO_LONG',
            message: `Expiry time cannot exceed ${MAX_EXPIRY} seconds (7 days) - R2 limit`
        };
    }

    return { valid: true };
};

/**
 * Validate file size
 * 
 * @param {number} fileSize - File size in bytes
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateFileSize = (fileSize) => {
    if (!fileSize || fileSize < MIN_FILE_SIZE) {
        return {
            valid: false,
            error: 'FILE_TOO_SMALL',
            message: 'File must be at least 1 byte'
        };
    }

    if (fileSize > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: 'FILE_TOO_LARGE',
            message: `File size (${fileSize} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes / 5GB)`,
            hint: 'Consider splitting large files or using multipart upload'
        };
    }

    return { valid: true };
};

// ============================================================================
// Response Formatters
// ============================================================================

/**
 * Format R2 API response (match existing provider pattern)
 * 
 * @param {Object} data - Response data
 * @returns {Object} Formatted response
 */
export const formatR2Response = (data) => {
    return {
        success: true,
        provider: 'r2',
        data,
        timestamp: new Date().toISOString()
    };
};

/**
 * Format R2 error response (with helpful hints)
 * Following Rule #8: Error messages must guide user
 * 
 * @param {string} error - Error code
 * @param {string} message - Error message
 * @param {string} hint - Optional hint for user
 * @returns {Object} Formatted error
 */
export const formatR2Error = (error, message, hint = null) => {
    const response = {
        success: false,
        provider: 'r2',
        error,
        message
    };

    if (hint) {
        response.hint = hint;
    }

    response.docs = 'https://developers.cloudflare.com/r2/';

    return response;
};
