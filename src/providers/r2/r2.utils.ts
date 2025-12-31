/**
 * R2 Utility Functions
 * 
 * Helper functions for R2 provider including validation, URL building, and batch operations.
 * These utilities ensure data integrity before making API calls and provide consistent formatting.
 * 
 * @module providers/r2/utils
 */

import { R2UploadOptions, R2BatchUploadOptions } from '../../types/r2.types.js';

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation result interface
 */
export interface ValidationResult {
    /** Whether validation passed */
    valid: boolean;

    /** Error message if validation failed */
    error?: string;
}

/**
 * Validate R2 credentials format
 * 
 * Performs client-side validation of R2 credentials before making API calls.
 * This catches format errors early and provides helpful error messages.
 * 
 * @param options - R2 upload or batch upload options containing credentials
 * @returns Validation result with error message if invalid
 * 
 * @example
 * ```typescript
 * const validation = validateR2Credentials(options);
 * if (!validation.valid) {
 *   throw new Error(`R2 Credentials Invalid: ${validation.error}`);
 * }
 * ```
 */
export function validateR2Credentials(
    options: R2UploadOptions | R2BatchUploadOptions
): ValidationResult {
    const { r2AccessKey, r2SecretKey, r2AccountId, r2Bucket } = options;

    // Check required fields exist
    if (!r2AccessKey || typeof r2AccessKey !== 'string') {
        return { valid: false, error: 'r2AccessKey is required (string)' };
    }

    if (!r2SecretKey || typeof r2SecretKey !== 'string') {
        return { valid: false, error: 'r2SecretKey is required (string)' };
    }

    if (!r2AccountId || typeof r2AccountId !== 'string') {
        return { valid: false, error: 'r2AccountId is required (string)' };
    }

    if (!r2Bucket || typeof r2Bucket !== 'string') {
        return { valid: false, error: 'r2Bucket is required (string)' };
    }

    // Validate access key length
    if (r2AccessKey.length < 16 || r2AccessKey.length > 128) {
        return {
            valid: false,
            error: 'r2AccessKey must be 16-128 characters'
        };
    }

    // Validate secret key length
    if (r2SecretKey.length < 32 || r2SecretKey.length > 128) {
        return {
            valid: false,
            error: 'r2SecretKey must be 32-128 characters'
        };
    }

    // Validate account ID format (32-character hex string)
    if (!/^[a-f0-9]{32}$/.test(r2AccountId)) {
        return {
            valid: false,
            error: 'r2AccountId must be a 32-character hexadecimal string (e.g., "f1234567890abcdef1234567890abcde")'
        };
    }

    // Validate bucket name format
    // R2 bucket names follow S3 naming rules:
    // - 3-63 characters
    // - Lowercase alphanumeric with hyphens
    // - Must start and end with alphanumeric
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r2Bucket)) {
        return {
            valid: false,
            error: 'Invalid R2 bucket name format (must be 3-63 chars, lowercase alphanumeric with hyphens, start/end with alphanumeric)'
        };
    }

    return { valid: true };
}

// ============================================================================
// URL BUILDING
// ============================================================================

/**
 * Build public URL for uploaded file
 * 
 * Constructs the final public URL using either a custom domain or the default R2 public URL format.
 * 
 * @param accountId - Cloudflare account ID
 * @param bucket - R2 bucket name
 * @param filename - Name of the uploaded file
 * @param customDomain - Optional custom domain (e.g., 'https://cdn.myapp.com')
 * @returns Full public URL for the file
 * 
 * @example
 * ```typescript
 * // With custom domain
 * const url1 = buildPublicUrl('abc123...', 'uploads', 'photo.jpg', 'https://cdn.myapp.com');
 * // Returns: 'https://cdn.myapp.com/photo.jpg'
 * 
 * // Without custom domain (default R2 URL)
 * const url2 = buildPublicUrl('abc123...', 'uploads', 'photo.jpg');
 * // Returns: 'https://pub-abc123....r2.dev/photo.jpg'
 * ```
 */
export function buildPublicUrl(
    accountId: string,
    bucket: string,
    filename: string,
    customDomain?: string
): string {
    if (customDomain) {
        // Remove trailing slash from custom domain
        const cleanDomain = customDomain.replace(/\/+$/, '');
        return `${cleanDomain}/${filename}`;
    }

    // Default R2 public URL format
    // Note: Actual format depends on Cloudflare R2 public bucket configuration
    return `https://pub-${accountId}.r2.dev/${filename}`;
}

// ============================================================================
// BATCH HELPERS
// ============================================================================

/**
 * File metadata for batch operations
 */
export interface BatchFileMetadata {
    /** Filename */
    filename: string;

    /** MIME type */
    contentType: string;

    /** File size in bytes */
    fileSize: number;
}

/**
 * Generate batch upload payload
 * 
 * Normalizes file metadata for batch upload requests.
 * Ensures all files have required fields and default values.
 * 
 * @param files - Array of file metadata objects
 * @returns Normalized array of file metadata
 * 
 * @example
 * ```typescript
 * const files = [
 *   { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
 *   { filename: 'photo2.jpg', contentType: 'image/jpeg' }  // Missing fileSize
 * ];
 * 
 * const payload = generateBatchPayload(files);
 * // Returns: [
 * //   { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
 * //   { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 0 }
 * // ]
 * ```
 */
export function generateBatchPayload(
    files: Array<{ filename: string; contentType: string; fileSize?: number }>
): BatchFileMetadata[] {
    return files.map(file => ({
        filename: file.filename,
        contentType: file.contentType,
        fileSize: file.fileSize || 0
    }));
}

/**
 * Validate batch size limits
 * 
 * Ensures batch operations don't exceed R2/SDK limits.
 * 
 * @param count - Number of files in batch
 * @param operation - Operation type ('upload' or 'delete')
 * @returns Validation result
 * 
 * @example
 * ```typescript
 * const validation = validateBatchSize(150, 'upload');
 * if (!validation.valid) {
 *   throw new Error(validation.error);
 * }
 * ```
 */
export function validateBatchSize(
    count: number,
    operation: 'upload' | 'delete'
): ValidationResult {
    if (count === 0) {
        return {
            valid: false,
            error: `${operation} batch cannot be empty`
        };
    }

    const maxLimit = operation === 'upload' ? 100 : 1000;

    if (count > maxLimit) {
        return {
            valid: false,
            error: `${operation} batch exceeds maximum of ${maxLimit} files (got ${count})`
        };
    }

    return { valid: true };
}

// ============================================================================
// FILE KEY EXTRACTION
// ============================================================================

/**
 * Extract file key from R2 URL
 * 
 * Parses various R2 URL formats to extract the object key.
 * Supports both default R2 URLs and custom domain URLs.
 * 
 * @param url - Full R2 file URL
 * @param customDomain - Optional custom domain to match against
 * @returns Extracted file key or null if parsing fails
 * 
 * @example
 * ```typescript
 * // Default R2 URL
 * const key1 = extractFileKeyFromUrl('https://pub-abc123.r2.dev/photos/avatar.jpg');
 * // Returns: 'photos/avatar.jpg'
 * 
 * // Custom domain URL
 * const key2 = extractFileKeyFromUrl(
 *   'https://cdn.myapp.com/photos/avatar.jpg',
 *   'https://cdn.myapp.com'
 * );
 * // Returns: 'photos/avatar.jpg'
 * ```
 */
export function extractFileKeyFromUrl(
    url: string,
    customDomain?: string
): string | null {
    try {
        const urlObj = new URL(url);

        if (customDomain) {
            const domainObj = new URL(customDomain);

            // Check if URL matches custom domain
            if (urlObj.hostname === domainObj.hostname) {
                // Remove leading slash
                return urlObj.pathname.substring(1);
            }
        }

        // Check for default R2 URL pattern (pub-{accountId}.r2.dev)
        if (urlObj.hostname.match(/^pub-[a-f0-9]{32}\.r2\.dev$/)) {
            // Remove leading slash
            return urlObj.pathname.substring(1);
        }

        // Fallback: return pathname without leading slash
        return urlObj.pathname.substring(1);
    } catch (error) {
        // Invalid URL
        return null;
    }
}

// ============================================================================
// METADATA HELPERS
// ============================================================================

/**
 * Sanitize metadata for R2 storage
 * 
 * Ensures metadata meets R2 requirements:
 * - Keys are lowercase
 * - Values are strings
 * - No reserved keys
 * 
 * @param metadata - Raw metadata object
 * @returns Sanitized metadata
 * 
 * @example
 * ```typescript
 * const metadata = sanitizeMetadata({
 *   'User-ID': 123,
 *   uploadedBy: 'john@example.com',
 *   ContentType: 'image/jpeg'  // Reserved key
 * });
 * // Returns: {
 * //   'user-id': '123',
 * //   'uploadedby': 'john@example.com'
 * // }
 * ```
 */
export function sanitizeMetadata(
    metadata: Record<string, any>
): Record<string, string> {
    const reserved = ['content-type', 'content-length', 'content- encoding', 'etag'];
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
        const lowerKey = key.toLowerCase().replace(/-/g, '');

        // Skip reserved keys
        if (reserved.includes(lowerKey)) {
            continue;
        }

        // Convert value to string
        sanitized[lowerKey] = String(value);
    }

    return sanitized;
}
