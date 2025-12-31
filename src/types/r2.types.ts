/**
 * R2 Provider Types
 * 
 * Type definitions specific to Cloudflare R2 storage.
 * R2 provides S3-compatible object storage with zero egress fees and exceptional performance.
 * 
 * Performance Targets:
 * - Single upload: <50ms (vs Vercel: 220ms)
 * - Batch 100 files: <500ms
 * - Download URL: <30ms
 * - Token generation: <20ms
 * 
 * @module types/r2
 */

import { BaseUploadOptions, BaseDeleteOptions, BaseDownloadOptions } from './common.js';

// ============================================================================
// R2 Upload Options
// ============================================================================

/**
 * R2-specific upload options
 * 
 * @example
 * ```typescript
 * const options: R2UploadOptions = {
 *   filename: 'avatar.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'R2',
 *   r2AccessKey: 'xxx...', 
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads'
 * };
 * ```
 */
export interface R2UploadOptions extends BaseUploadOptions {
    /** Must be 'R2' */
    provider: 'R2';

    /**
     * R2 Access Key ID
     * Get from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
     * Format: 20-128 characters
     */
    r2AccessKey: string;

    /**
     * R2 Secret Access Key
     * Get from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
     * Format: 32-128 characters
     */
    r2SecretKey: string;

    /**
     * Cloudflare Account ID
     * Find in: Cloudflare Dashboard → R2 (32-character hex string)
     * Format: 32 hex characters (e.g., 'f1234567890abcdef1234567890abcde')
     */
    r2AccountId: string;

    /**
     * R2 Bucket name
     * Format: 3-63 characters, lowercase, alphanumeric with hyphens
     * Must start and end with alphanumeric character
     */
    r2Bucket: string;

    /**
     * Custom public URL domain (optional)
     * Use your own domain instead of pub-{accountId}.r2.dev
     * Example: 'https://cdn.myapp.com'
     */
    r2PublicUrl?: string;

    /**
     * Custom file metadata (optional)
     * Key-value pairs attached to the uploaded file
     */
    metadata?: Record<string, string>;

    /**
     * Use JWT access token instead of direct upload (optional)
     * Enables time-limited, permission-scoped access
     */
    useAccessToken?: boolean;

    /**
     * Token permissions when useAccessToken is true (optional)
     * Defines what operations the token allows
     */
    tokenPermissions?: ('read' | 'write' | 'delete')[];
}

// ============================================================================
// R2 Batch Upload Options
// ============================================================================

/**
 * R2 batch upload options
 * Upload up to 100 files in a single API call
 * 
 * @example
 * ```typescript
 * const options: R2BatchUploadOptions = {
 *   files: [
 *     { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
 *     { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 }
 *   ],
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads'
 * };
 * ```
 */
export interface R2BatchUploadOptions extends Omit<R2UploadOptions, 'provider' | 'filename' | 'contentType' | 'fileSize'> {
    /**
     * Array of files to upload
     * Maximum: 100 files per batch
     */
    files: Array<{
        /** Filename for each file */
        filename: string;

        /** MIME type for each file */
        contentType: string;

        /** File size in bytes (optional) */
        fileSize?: number;
    }>;
}

// ============================================================================
// R2 Delete Options
// ============================================================================

/**
 * R2-specific delete options
 * 
 * @example
 * ```typescript
 * const options: R2DeleteOptions = {
 *   fileUrl: 'https://pub-abc123.r2.dev/avatar.jpg',
 *   provider: 'R2',
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads'
 * };
 * ```
 */
export interface R2DeleteOptions extends BaseDeleteOptions {
    /** Must be 'R2' */
    provider: 'R2';

    /** R2 Access Key ID */
    r2AccessKey: string;

    /** R2 Secret Access Key */
    r2SecretKey: string;

    /** Cloudflare Account ID */
    r2AccountId: string;

    /** R2 Bucket name */
    r2Bucket: string;
}

// ============================================================================
// R2 Batch Delete Options
// ============================================================================

/**
 * R2 batch delete options
 * Delete up to 1000 files in a single API call
 * 
 * @example
 * ```typescript
 * const options: R2BatchDeleteOptions = {
 *   fileKeys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads'
 * };
 * ```
 */
export interface R2BatchDeleteOptions {
    /**
     * Array of file keys to delete
     * Maximum: 1000 files per batch
     */
    fileKeys: string[];

    /** R2 Access Key ID */
    r2AccessKey: string;

    /** R2 Secret Access Key */
    r2SecretKey: string;

    /** Cloudflare Account ID */
    r2AccountId: string;

    /** R2 Bucket name */
    r2Bucket: string;
}

// ============================================================================
// R2 Download Options
// ============================================================================

/**
 * R2-specific download options
 * 
 * @example
 * ```typescript
 * const options: R2DownloadOptions = {
 *   fileKey: 'avatar.jpg',
 *   provider: 'R2',
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads',
 *   expiresIn: 3600
 * };
 * ```
 */
export interface R2DownloadOptions extends BaseDownloadOptions {
    /** Must be 'R2' */
    provider: 'R2';

    /**
     * Object key to download
     * Example: 'avatar.jpg' or 'users/123/profile.png'
     */
    fileKey: string;

    /** R2 Access Key ID */
    r2AccessKey: string;

    /** R2 Secret Access Key */
    r2SecretKey: string;

    /** Cloudflare Account ID */
    r2AccountId: string;

    /** R2 Bucket name */
    r2Bucket: string;

    /**
     * Custom public URL domain (optional)
     * Use your own domain instead of pub-{accountId}.r2.dev
     */
    r2PublicUrl?: string;
}

// ============================================================================
// R2 Access Token Options (Enterprise Security)
// ============================================================================

/**
 * R2 JWT access token generation options
 * Create time-limited, permission-scoped tokens for secure file access
 * 
 * @example
 * ```typescript
 * const options: R2AccessTokenOptions = {
 *   r2Bucket: 'private-docs',
 *   fileKey: 'confidential-report.pdf',
 *   permissions: ['read'],
 *   expiresIn: 3600
 * };
 * ```
 */
export interface R2AccessTokenOptions {
    /** R2 Bucket name */
    r2Bucket: string;

    /**
     * Specific file key (optional)
     * If not provided, token applies to entire bucket
     */
    fileKey?: string;

    /**
     * Permissions granted by this token
     * Array of: 'read', 'write', 'delete'
     */
    permissions: ('read' | 'write' | 'delete')[];

    /**
     * Token expiration time in seconds
     * Range: 60-604800 seconds (1 minute to 7 days)
     * Default: 3600 (1 hour)
     */
    expiresIn?: number;

    /**
     * Custom metadata/claims to include in token (optional)
     * Can be used for application-specific data
     */
    metadata?: Record<string, any>;
}

/**
 * R2 token validation result
 */
export interface R2TokenValidationResult {
    /** Whether the token is valid */
    valid: boolean;

    /** User ID extracted from token */
    userId?: string;

    /** Permissions granted by token */
    permissions?: string[];

    /** Bucket the token is valid for */
    bucket?: string;

    /** Specific file key (if token is file-specific) */
    fileKey?: string;

    /** Token expiration timestamp */
    expiresAt?: string;
}

// ============================================================================
// R2 List Options
// ============================================================================

/**
 * R2 file listing options
 * List and browse files in an R2 bucket
 * 
 * @example
 * ```typescript
 * const options: R2ListOptions = {
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads',
 *   prefix: 'documents/',
 *   maxKeys: 50
 * };
 * ```
 */
export interface R2ListOptions {
    /** R2 Access Key ID */
    r2AccessKey: string;

    /** R2 Secret Access Key */
    r2SecretKey: string;

    /** Cloudflare Account ID */
    r2AccountId: string;

    /** R2 Bucket name */
    r2Bucket: string;

    /**
     * Filter results by prefix (optional)
     * Example: 'documents/' lists only files in documents folder
     */
    prefix?: string;

    /**
     * Maximum number of results to return
     * Range: 1-1000
     * Default: 100
     */
    maxKeys?: number;

    /**
     * Continuation token for pagination (optional)
     * Returned from previous list request
     */
    continuationToken?: string;
}

// ============================================================================
// R2 Response Types
// ============================================================================

/**
 * R2 upload response
 */
export interface R2UploadResponse {
    /** Request succeeded */
    success: true;

    /** Presigned URL for PUT request */
    uploadUrl: string;

    /** Final public URL where file will be accessible */
    publicUrl: string;

    /** Unique upload identifier */
    uploadId: string;

    /** Provider identifier */
    provider: 'r2';

    /** URL expiration time in seconds */
    expiresIn: number;

    /** Upload data */
    data: {
        /** Filename */
        filename: string;

        /** Bucket name */
        bucket: string;

        /** Account ID */
        accountId: string;

        /** HTTP method (always 'PUT' for R2) */
        method: 'PUT';
    };

    /** Performance metrics (optional) */
    performance?: {
        /** Total request time */
        totalTime: string;

        /** Time breakdown */
        breakdown: {
            /** Memory guard check time */
            memoryGuard: string;

            /** Redis rate limit check time */
            redisCheck: string;

            /** Crypto signing time (ZERO API calls!) */
            cryptoSigning: string;
        };
    };
}

/**
 * R2 batch upload response
 */
export interface R2BatchUploadResponse {
    /** Request succeeded */
    success: true;

    /** Array of upload URLs for each file */
    urls: Array<{
        /** Filename */
        filename: string;

        /** Presigned URL for PUT request */
        uploadUrl: string;

        /** Final public URL */
        publicUrl: string;

        /** Unique upload identifier */
        uploadId: string;
    }>;

    /** Total number of files */
    total: number;

    /** Provider identifier */
    provider: 'r2';

    /** Performance metrics */
    performance: {
        /** Total time for all files */
        totalTime: string;

        /** Average time per file */
        averagePerFile: string;
    };
}

/**
 * R2 download response
 */
export interface R2DownloadResponse {
    /** Request succeeded */
    success: true;

    /** Presigned GET URL for downloading */
    downloadUrl: string;

    /** Public URL (if applicable) */
    publicUrl: string;

    /** File key */
    fileKey: string;

    /** URL expiration time in seconds */
    expiresIn: number;

    /** URL expiration timestamp */
    expiresAt: string;

    /** Provider identifier */
    provider: 'r2';
}

/**
 * R2 access token response
 */
export interface R2AccessTokenResponse {
    /** Request succeeded */
    success: true;

    /** JWT token string */
    token: string;

    /** Unique token identifier */
    tokenId: string;

    /** Bucket this token is valid for */
    bucket: string;

    /** File key (null if bucket-level token) */
    fileKey: string | null;

    /** Permissions granted by token */
    permissions: string[];

    /** Token expiration time in seconds */
    expiresIn: number;

    /** Token expiration timestamp */
    expiresAt: string;

    /** Usage instructions */
    usage: {
        /** How to use the token in requests */
        header: string;

        /** Description of token usage */
        description: string;
    };
}

/**
 * R2 list files response
 */
export interface R2ListResponse {
    /** Request succeeded */
    success: true;

    /** Array of files */
    files: Array<{
        /** Object key (filename) */
        key: string;

        /** File size in bytes */
        size: number;

        /** Last modification timestamp */
        lastModified: string;

        /** ETag (entity tag) */
        etag: string;
    }>;

    /** Number of files returned */
    count: number;

    /** Whether there are more results */
    truncated: boolean;

    /** Continuation token for next page (if truncated) */
    continuationToken?: string;

    /** Provider identifier */
    provider: 'r2';
}

/**
 * R2 batch delete response
 */
export interface R2BatchDeleteResponse {
    /** Request succeeded */
    success: true;

    /** Array of successfully deleted file keys */
    deleted: string[];

    /** Array of file keys that failed to delete */
    errors: string[];

    /** Provider identifier */
    provider: 'r2';
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract R2-specific options from generic options
 */
export type ExtractR2Options<T> = T extends { provider: 'R2' } ? T : never;
