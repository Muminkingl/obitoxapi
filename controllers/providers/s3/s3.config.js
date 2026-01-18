/**
 * AWS S3 Storage Configuration
 * S3-compatible provider with pure cryptographic signing (NO external API calls)
 * 
 * Architecture: AWS SDK v3 for pure crypto signing (zero network calls)
 * Performance Target: 7-15ms response time (same as R2)
 * 
 * Based on R2 configuration pattern (90% code reuse)
 */

import { S3Client } from '@aws-sdk/client-s3';
import { isValidRegion, buildS3PublicUrl } from '../../../utils/aws/s3-regions.js';
import { isValidStorageClass } from '../../../utils/aws/s3-storage-classes.js';

// ============================================================================
// File Size Limits (Same as R2)
// ============================================================================

export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB per object
export const MIN_FILE_SIZE = 1; // 1 byte
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB (use multipart above this)

// ============================================================================
// Signed URL Configuration (Same as R2)
// ============================================================================

export const SIGNED_URL_EXPIRY = 3600; // 1 hour default (seconds)
export const MAX_EXPIRY = 604800; // 7 days maximum (seconds)
export const MIN_EXPIRY = 60; // 1 minute minimum (seconds)

// ============================================================================
// Server-Side Encryption
// ============================================================================

export const DEFAULT_ENCRYPTION = 'AES256'; // SSE-S3 (free, managed by AWS)

// Supported encryption types (Phase 3B: SSE-KMS support)
export const ENCRYPTION_TYPES = {
    'SSE-S3': 'AES256',      // AWS-managed keys (default)
    'SSE-KMS': 'aws:kms'     // Customer-managed keys (KMS)
};

export const VALID_ENCRYPTION_TYPES = Object.keys(ENCRYPTION_TYPES);

// Available encryption methods:
// - 'AES256': SSE-S3 (server-side encryption with S3-managed keys) - DEFAULT
// - 'aws:kms': SSE-KMS (server-side encryption with KMS keys) - Phase 3

// ============================================================================
// Credential Validation (FORMAT ONLY - NO API CALLS)
// ============================================================================

/**
 * Validate S3 credentials (FORMAT validation only, <1ms)
 * Following Rule #2: NEVER call AWS API to validate
 * Let S3 validate naturally at upload time (returns 403 if invalid)
 * 
 * @param {string} accessKey - AWS Access Key ID
 * @param {string} secretKey - AWS Secret Access Key
 * @param {string} bucket - S3 bucket name
 * @param {string} region - AWS region code
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateS3Credentials = (accessKey, secretKey, bucket, region) => {
    // Check all required fields
    if (!accessKey || !secretKey || !bucket || !region) {
        return {
            valid: false,
            error: 'MISSING_S3_CREDENTIALS',
            message: 'AWS Access Key ID, Secret Access Key, Bucket, and Region are all required',
            hint: 'Get your AWS credentials from: AWS Console → IAM → Users → Security Credentials'
        };
    }

    // Type validation
    if (typeof accessKey !== 'string' || typeof secretKey !== 'string' ||
        typeof bucket !== 'string' || typeof region !== 'string') {
        return {
            valid: false,
            error: 'INVALID_CREDENTIALS_TYPE',
            message: 'All S3 credentials must be strings'
        };
    }

    // Access Key format (typically 20 characters, starts with AKIA)
    if (accessKey.length < 16 || accessKey.length > 128) {
        return {
            valid: false,
            error: 'INVALID_ACCESS_KEY_FORMAT',
            message: 'AWS Access Key ID must be between 16-128 characters',
            hint: 'AWS Access Keys typically start with "AKIA" and are 20 characters long'
        };
    }

    // Secret Key format (typically 40 characters, base64-encoded)
    if (secretKey.length < 32 || secretKey.length > 128) {
        return {
            valid: false,
            error: 'INVALID_SECRET_KEY_FORMAT',
            message: 'AWS Secret Access Key must be between 32-128 characters',
            hint: 'Your Secret Access Key is shown only once when created. Make sure you saved it correctly.'
        };
    }

    // Bucket name format (S3 naming rules)
    // 3-63 characters, lowercase, numbers, hyphens, periods
    const bucketRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
    if (!bucketRegex.test(bucket)) {
        return {
            valid: false,
            error: 'INVALID_BUCKET_NAME',
            message: 'S3 bucket name must be 3-63 characters, lowercase letters, numbers, hyphens, and periods only',
            hint: 'Bucket names must start and end with a letter or number'
        };
    }

    // Region validation
    if (!isValidRegion(region)) {
        return {
            valid: false,
            error: 'INVALID_S3_REGION',
            message: `Invalid AWS region: ${region}`,
            hint: 'Use a valid AWS region like us-east-1, eu-west-1, ap-south-1',
            docs: 'https://docs.aws.amazon.com/general/latest/gr/s3.html'
        };
    }

    // ✅ All format validations passed
    return { valid: true };
};

// ============================================================================
// S3Client Factory (Pure Crypto - NO API CALLS)
// ============================================================================

/**
 * Create configured S3Client for AWS S3
 * This client is used for pure cryptographic operations (signing URLs)
 * NO network calls are made when creating the client or signing URLs
 * 
 * Following Rule #1: NO external API calls in request path
 * 
 * @param {string} region - AWS region code
 * @param {string} accessKey - AWS Access Key ID
 * @param {string} secretKey - AWS Secret Access Key
 * @returns {S3Client} Configured S3 client
 */
export const getS3Client = (region, accessKey, secretKey) => {
    return new S3Client({
        region, // Actual AWS region (not 'auto' like R2)
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey
        },
        // Performance optimizations (same as R2)
        maxAttempts: 3,
        requestHandler: {
            connectionTimeout: 3000,
            socketTimeout: 3000
        }
    });
};

// ============================================================================
// Object Key Generation (Same as R2)
// ============================================================================

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
// Validation Helpers (Same as R2)
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
            message: `Expiry time cannot exceed ${MAX_EXPIRY} seconds (7 days)`
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
            hint: 'Consider using multipart upload for large files'
        };
    }

    return { valid: true };
};

/**
 * Validate storage class
 * 
 * @param {string} storageClass - Storage class name
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateStorageClass = (storageClass) => {
    if (!storageClass) {
        return { valid: true }; // Optional parameter
    }

    if (!isValidStorageClass(storageClass)) {
        return {
            valid: false,
            error: 'INVALID_STORAGE_CLASS',
            message: `Invalid S3 storage class: ${storageClass}`,
            hint: 'Valid options: STANDARD, STANDARD_IA, GLACIER_INSTANT_RETRIEVAL'
        };
    }

    return { valid: true };
};

// ============================================================================
// Encryption Validation (Phase 3B: SSE-KMS Support)
// ============================================================================

/**
 * Validate encryption type
 * 
 * @param {string} encryptionType - Encryption type (SSE-S3 or SSE-KMS)
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateEncryptionType = (encryptionType) => {
    if (!encryptionType) {
        return { valid: true }; // Optional, defaults to SSE-S3
    }

    if (!VALID_ENCRYPTION_TYPES.includes(encryptionType)) {
        return {
            valid: false,
            error: 'INVALID_ENCRYPTION_TYPE',
            message: `Invalid encryption type: ${encryptionType}`,
            hint: `Valid options: ${VALID_ENCRYPTION_TYPES.join(', ')}`,
            docs: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/serv-side-encryption.html'
        };
    }

    return { valid: true };
};

/**
 * Validate KMS key ARN format
 * 
 * @param {string} kmsKeyId - KMS key ARN
 * @returns {Object} { valid: boolean, error?: string, message?: string }
 */
export const validateKmsKeyArn = (kmsKeyId) => {
    if (!kmsKeyId) {
        return {
            valid: false,
            error: 'MISSING_KMS_KEY',
            message: 'KMS key ARN required for SSE-KMS encryption',
            hint: 'Provide s3KmsKeyId with format: arn:aws:kms:region:account:key/key-id'
        };
    }

    // KMS ARN format: arn:aws:kms:region:account-id:key/key-id
    // Example: arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012
    const kmsArnPattern = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]+$/;

    if (!kmsArnPattern.test(kmsKeyId)) {
        return {
            valid: false,
            error: 'INVALID_KMS_KEY_FORMAT',
            message: 'KMS key ARN format is invalid',
            provided: kmsKeyId,
            example: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
            hint: 'Get your KMS key ARN from: AWS Console → KMS → Customer managed keys',
            docs: 'https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#key-id'
        };
    }

    return { valid: true };
};

// ============================================================================
// Response Formatters
// ============================================================================

/**
 * Format S3 API response (match existing provider pattern)
 * 
 * @param {Object} data - Response data
 * @returns {Object} Formatted response
 */
export const formatS3Response = (data) => {
    return {
        success: true,
        provider: 's3',
        data,
        timestamp: new Date().toISOString()
    };
};

/**
 * Format S3 error response (with helpful hints)
 * Following Rule #8: Error messages must guide user
 * 
 * @param {string} error - Error code
 * @param {string} message - Error message
 * @param {string} hint - Optional hint for user
 * @returns {Object} Formatted error
 */
export const formatS3Error = (error, message, hint = null) => {
    const response = {
        success: false,
        provider: 's3',
        error,
        message
    };

    if (hint) {
        response.hint = hint;
    }

    response.docs = 'https://docs.aws.amazon.com/s3/';

    return response;
};
