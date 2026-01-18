/**
 * AWS S3 Utility Functions
 * 
 * Client-side validation helpers for S3 operations.
 * These perform format-only validation (no API calls) for instant feedback.
 * 
 * @module providers/s3/utils
 */

import type { S3UploadOptions, S3DeleteOptions, S3BatchDeleteOptions } from '../../types/s3.types.js';

// ============================================================================
// Credential Validation
// ============================================================================

/**
 * Validate S3 credentials format (client-side, instant)
 * 
 * Performs format-only validation without making API calls.
 * This provides instant feedback before expensive operations.
 * 
 * @param options - S3 upload or delete options
 * @returns Validation result with error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateS3Credentials({
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-bucket'
 * });
 * 
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateS3Credentials(
    options: Partial<S3UploadOptions> | Partial<S3DeleteOptions>
): { valid: boolean; error?: string } {
    // Validate Access Key
    if (!options.s3AccessKey) {
        return {
            valid: false,
            error: 'S3 Access Key is required'
        };
    }

    if (typeof options.s3AccessKey !== 'string' || options.s3AccessKey.trim().length === 0) {
        return {
            valid: false,
            error: 'S3 Access Key must be a non-empty string'
        };
    }

    // Validate Secret Key
    if (!options.s3SecretKey) {
        return {
            valid: false,
            error: 'S3 Secret Key is required'
        };
    }

    if (typeof options.s3SecretKey !== 'string' || options.s3SecretKey.trim().length === 0) {
        return {
            valid: false,
            error: 'S3 Secret Key must be a non-empty string'
        };
    }

    // Validate Bucket Name
    if (!options.s3Bucket) {
        return {
            valid: false,
            error: 'S3 Bucket name is required'
        };
    }

    if (typeof options.s3Bucket !== 'string' || options.s3Bucket.trim().length === 0) {
        return {
            valid: false,
            error: 'S3 Bucket name must be a non-empty string'
        };
    }

    // Validate bucket name format (S3 rules)
    const bucketNameRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
    if (!bucketNameRegex.test(options.s3Bucket)) {
        return {
            valid: false,
            error: 'S3 Bucket name must be 3-63 characters, lowercase, alphanumeric with hyphens/dots'
        };
    }

    // Validate encryption (if SSE-KMS is specified, KMS key is required)
    if ('s3EncryptionType' in options) {
        if (options.s3EncryptionType === 'SSE-KMS') {
            if (!('s3KmsKeyId' in options) || !options.s3KmsKeyId) {
                return {
                    valid: false,
                    error: 'KMS Key ID is required when using SSE-KMS encryption'
                };
            }

            // Validate KMS key ARN format (basic check)
            const kmsArnRegex = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]+$/;
            if (!kmsArnRegex.test(options.s3KmsKeyId)) {
                return {
                    valid: false,
                    error: 'Invalid KMS Key ARN format. Expected: arn:aws:kms:region:account-id:key/key-id'
                };
            }
        }
    }

    return { valid: true };
}

// ============================================================================
// Batch Size Validation
// ============================================================================

/**
 * Validate batch operation size
 * 
 * S3 has limits on batch operations:
 * - Batch delete: Maximum 1000 keys
 * 
 * @param items - Array of items to validate
 * @param operation - Operation name for error messages
 * @param maxSize - Maximum allowed items (default: 1000)
 * @returns Validation result with error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateBatchSize(fileKeys, 'batch delete', 1000);
 * 
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateBatchSize(
    items: unknown[],
    operation: string,
    maxSize: number = 1000
): { valid: boolean; error?: string } {
    // Validate input is an array
    if (!Array.isArray(items)) {
        return {
            valid: false,
            error: `${operation}: items must be an array`
        };
    }

    // Validate array is not empty
    if (items.length === 0) {
        return {
            valid: false,
            error: `${operation}: items array cannot be empty`
        };
    }

    // Validate array size doesn't exceed maximum
    if (items.length > maxSize) {
        return {
            valid: false,
            error: `${operation}: Maximum ${maxSize} items allowed (received ${items.length}). Split into ${Math.ceil(items.length / maxSize)} smaller batches.`
        };
    }

    return { valid: true };
}

// ============================================================================
// Region Validation
// ============================================================================

/**
 * List of valid AWS S3 regions (27 standard regions)
 * Excludes AWS China and GovCloud regions (require special accounts)
 */
export const VALID_S3_REGIONS = [
    // North America (5 regions)
    'us-east-1',      // N. Virginia
    'us-east-2',      // Ohio
    'us-west-1',      // N. California
    'us-west-2',      // Oregon
    'ca-central-1',   // Canada

    // Europe (7 regions)
    'eu-west-1',      // Ireland
    'eu-west-2',      // London
    'eu-west-3',      // Paris
    'eu-central-1',   // Frankfurt
    'eu-north-1',     // Stockholm
    'eu-south-1',     // Milan
    'eu-south-2',     // Spain

    // Asia Pacific (10 regions)
    'ap-south-1',     // Mumbai
    'ap-south-2',     // Hyderabad
    'ap-southeast-1', // Singapore
    'ap-southeast-2', // Sydney
    'ap-southeast-3', // Jakarta
    'ap-southeast-4', // Melbourne
    'ap-northeast-1', // Tokyo
    'ap-northeast-2', // Seoul
    'ap-northeast-3', // Osaka
    'ap-east-1',      // Hong Kong

    // Middle East (3 regions)
    'me-south-1',     // Bahrain
    'me-central-1',   // UAE
    'il-central-1',   // Israel

    // South America (1 region)
    'sa-east-1',      // São Paulo

    // Africa (1 region)
    'af-south-1'      // Cape Town
] as const;

/**
 * Validate AWS region
 * 
 * @param region - AWS region to validate
 * @returns Validation result with error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateS3Region('us-west-2');
 * 
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateS3Region(region: string): { valid: boolean; error?: string } {
    if (!region || typeof region !== 'string') {
        return {
            valid: false,
            error: 'Region must be a non-empty string'
        };
    }

    if (!VALID_S3_REGIONS.includes(region as any)) {
        return {
            valid: false,
            error: `Invalid S3 region: ${region}. Must be one of: ${VALID_S3_REGIONS.slice(0, 5).join(', ')}, ... (27 total)`
        };
    }

    return { valid: true };
}

// ============================================================================
// Storage Class Validation
// ============================================================================

/**
 * List of valid S3 storage classes
 */
export const VALID_STORAGE_CLASSES = [
    'STANDARD',
    'STANDARD_IA',
    'ONEZONE_IA',
    'GLACIER_INSTANT_RETRIEVAL',
    'GLACIER_FLEXIBLE_RETRIEVAL',
    'GLACIER_DEEP_ARCHIVE',
    'INTELLIGENT_TIERING'
] as const;

/**
 * Validate S3 storage class
 * 
 * @param storageClass - Storage class to validate
 * @returns Validation result with error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateStorageClass('STANDARD_IA');
 * 
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateStorageClass(storageClass: string): { valid: boolean; error?: string } {
    if (!storageClass || typeof storageClass !== 'string') {
        return {
            valid: false,
            error: 'Storage class must be a non-empty string'
        };
    }

    if (!VALID_STORAGE_CLASSES.includes(storageClass as any)) {
        return {
            valid: false,
            error: `Invalid storage class: ${storageClass}. Must be one of: ${VALID_STORAGE_CLASSES.join(', ')}`
        };
    }

    return { valid: true };
}

// ============================================================================
// Encryption Type Validation
// ============================================================================

/**
 * List of valid S3 encryption types
 */
export const VALID_ENCRYPTION_TYPES = ['SSE-S3', 'SSE-KMS'] as const;

/**
 * Validate S3 encryption type
 * 
 * @param encryptionType - Encryption type to validate
 * @returns Validation result with error message if invalid
 * 
 * @example
 * ```typescript
 * const result = validateEncryptionType('SSE-KMS');
 * 
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateEncryptionType(encryptionType: string): { valid: boolean; error?: string } {
    if (!encryptionType || typeof encryptionType !== 'string') {
        return {
            valid: false,
            error: 'Encryption type must be a non-empty string'
        };
    }

    if (!VALID_ENCRYPTION_TYPES.includes(encryptionType as any)) {
        return {
            valid: false,
            error: `Invalid encryption type: ${encryptionType}. Must be one of: ${VALID_ENCRYPTION_TYPES.join(', ')}`
        };
    }

    return { valid: true };
}
