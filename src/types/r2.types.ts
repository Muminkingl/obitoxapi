/**
 * R2 Provider Types
 * 
 * Type definitions specific to Cloudflare R2 storage.
 * R2 provides S3-compatible object storage with zero egress fees and exceptional performance.
 * 
 * Performance Targets:
 * - Single upload: <50ms
 * - Batch 100 files: <500ms
 * - Download URL: <30ms
 * - Token generation: <20ms
 * 
 * @module types/r2
 */

import { BaseUploadOptions, BaseDeleteOptions, BaseDownloadOptions, NetworkInfo, ValidationConfig, WebhookConfig } from './common.js';

// ============================================================================
// R2 Configuration (Provider Instance Pattern)
// ============================================================================

/**
 * R2 Provider Configuration
 * 
 * Used to initialize an R2 provider instance with stored credentials.
 * Once configured, all methods use these credentials automatically.
 * 
 * @example
 * ```typescript
 * const r2 = client.r2({
 *   accessKey: 'xxx...',
 *   secretKey: 'yyy...',
 *   accountId: 'abc123...',
 *   bucket: 'my-uploads',
 *   publicUrl: 'https://cdn.myapp.com'  // optional
 * });
 * 
 * // All methods now use stored credentials
 * await r2.uploadFile(file);
 * await r2.configureCors({ origins: ['https://app.com'] });
 * ```
 */
export interface R2Config {
    /**
     * R2 Access Key ID
     * Get from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
     */
    accessKey: string;

    /**
     * R2 Secret Access Key
     * Get from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
     */
    secretKey: string;

    /**
     * Cloudflare Account ID
     * Find in: Cloudflare Dashboard → R2 (32-character hex string)
     */
    accountId: string;

    /**
     * R2 Bucket name
     */
    bucket: string;

    /**
     * Custom public URL domain (optional)
     * Use your own domain instead of pub-{accountId}.r2.dev
     */
    publicUrl?: string;
}

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
 *   r2Bucket: 'my-uploads',
 *   // ✅ NEW: Webhook configuration
 *   webhook: {
 *     url: 'https://myapp.com/webhooks/upload',
 *     secret: 'webhook_secret_123',
 *     trigger: 'manual' // or 'auto'
 *   }
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

    // ==================== SMART EXPIRY ====================
    /**
     * Network information for smart presigned URL expiry (optional)
     * Auto-detected from browser if not provided
     * Used to calculate optimal URL expiration time
     */
    networkInfo?: NetworkInfo | null;

    // ==================== FILE VALIDATION ====================
    /**
     * File validation configuration (optional)
     * Validates file before upload - blocks invalid files with clear error messages
     * 
     * @example
     * ```typescript
     * // Use a preset
     * validation: 'images'
     * 
     * // Custom configuration
     * validation: {
     *   maxSize: 10 * 1024 * 1024,
     *   allowedTypes: ['image/*'],
     *   blockDangerous: true
     * }
     * ```
     */
    validation?: ValidationConfig | 'images' | 'documents' | 'videos' | 'audio' | 'archives' | 'any' | null;

    // ==================== WEBHOOK ====================
    /**
     * Webhook configuration (optional)
     * Configure webhook to be called when upload completes
     * 
     * @example
     * ```typescript
     * // Manual confirmation (client calls confirm after upload)
     * webhook: {
     *   url: 'https://myapp.com/webhooks/upload',
     *   secret: 'webhook_secret_123',
     *   trigger: 'manual',
     *   metadata: { userId: '123' }
     * }
     * 
     * // Auto confirmation (server polls for file)
     * webhook: {
     *   url: 'https://myapp.com/webhooks/upload',
     *   trigger: 'auto'
     * }
     * ```
     */
    webhook?: WebhookConfig | null;
}

// ============================================================================
// R2 Batch Upload Options
// ============================================================================

/**
 * R2 batch upload options
 * Upload up to 100 files with validation + smart expiry
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
 *   r2Bucket: 'my-uploads',
 *   // ✅ NEW: Validation preset
 *   validation: 'images',
 *   // ✅ NEW: Smart expiry
 *   networkInfo: { effectiveType: '4g' }
 * };
 * ```
 */
export interface R2BatchUploadOptions extends Omit<R2UploadOptions, 'provider' | 'filename' | 'contentType' | 'fileSize' | 'validation' | 'networkInfo'> {
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

    // ==================== VALIDATION ====================
    /**
     * Validation configuration (optional)
     * Applied to ALL files in batch
     */
    validation?: ValidationConfig | 'images' | 'documents' | 'videos' | 'audio' | 'archives' | 'any' | null;

    // ==================== SMART EXPIRY ====================
    /**
     * Network information for smart presigned URL expiry (optional)
     * Applied to ALL files in batch
     */
    networkInfo?: NetworkInfo | null;

    /**
     * Buffer multiplier for smart expiry (optional)
     * Default: 1.5 (50% buffer)
     * Higher = longer URL validity
     */
    bufferMultiplier?: number;
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

    /** Webhook configuration (if webhook was requested) */
    webhook?: {
        /** Webhook ID */
        webhookId: string;

        /** Webhook secret for signature verification */
        webhookSecret: string;

        /** Trigger mode: 'manual' or 'auto' */
        triggerMode: 'manual' | 'auto';
    } | null;

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
 * R2 batch upload response (Enhanced with validation + smart expiry)
 */
export interface R2BatchUploadResponse {
    /** Request succeeded */
    success: boolean;

    /** Array of upload results for each file */
    urls: Array<{
        /** Index in original request */
        index: number;

        /** Whether this file succeeded */
        success: boolean;

        /** Original filename */
        originalFilename?: string;

        /** Upload filename (with timestamp prefix) */
        uploadFilename?: string;

        /** Presigned URL for PUT request */
        uploadUrl?: string;

        /** Final public URL */
        publicUrl?: string;

        /** Content type */
        contentType?: string;

        /** File size */
        fileSize?: number;

        /** URL expiration time in seconds */
        expiresIn?: number;

        /** URL expiration timestamp */
        expiresAt?: string;

        // ✅ NEW: Smart expiry details
        smartExpiry?: {
            calculatedExpiry: number;
            estimatedUploadTime: number;
            networkType: string;
            bufferTime: number;
            reasoning: {
                fileSize: string;
                networkType: string;
                networkSpeed: string;
                estimatedUploadTime: string;
                bufferMultiplier: string;
                bufferTime: string;
                finalExpiry: string;
            };
        };

        // ✅ NEW: Validation errors
        error?: string;
        validationErrors?: string[];
        checks?: {
            magicBytes: {
                provided: boolean;
                detected: boolean;
            };
        };
    }>;

    /** Total number of files */
    total: number;

    /** ✅ NEW: Number of successful uploads */
    successful: number;

    /** ✅ NEW: Number of failed uploads */
    failed: number;

    /** Provider identifier */
    provider: 'r2';

    /** ✅ NEW: Errors for failed files */
    errors?: Array<{
        index: number;
        success: boolean;
        originalFilename?: string;
        error: string;
        validationErrors?: string[];
    }>;

    /** Performance metrics */
    performance: {
        /** Request ID for debugging */
        requestId?: string;

        /** Total time for all files */
        totalTime: string;

        /** Time breakdown */
        breakdown?: {
            /** Memory guard check time */
            memoryGuard: string;

            /** Crypto signing time */
            cryptoSigning: string;

            /** Average time per file */
            perFile: string;
        };
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
// R2 CORS Configuration Types (Option A: Backend Auto-Configuration)
// ============================================================================

/**
 * R2 CORS Configuration Options
 * 
 * Options for configuring CORS on an R2 bucket to enable direct browser uploads.
 * R2 uses the S3-compatible API for CORS configuration.
 * 
 * @example
 * ```typescript
 * const options: R2CorsConfigOptions = {
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2Bucket: 'my-uploads',
 *   r2AccountId: 'abc123...',
 *   allowedOrigins: ['https://myapp.com']
 * };
 * ```
 */
export interface R2CorsConfigOptions {
    /**
     * R2 Access Key ID
     * Get from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
     */
    r2AccessKey: string;

    /**
     * R2 Secret Access Key
     * Get from: Cloudflare Dashboard → R2 → Manage R2 API Tokens
     */
    r2SecretKey: string;

    /**
     * R2 Bucket name
     * The bucket to configure CORS on
     */
    r2Bucket: string;

    /**
     * Cloudflare Account ID
     * Find in: Cloudflare Dashboard → R2
     */
    r2AccountId: string;

    /**
     * Allowed origins for CORS
     * These origins will be allowed to make cross-origin requests
     * 
     * @example ['https://myapp.com', 'https://www.myapp.com']
     */
    allowedOrigins?: string[];

    /**
     * Allowed HTTP methods (optional)
     * Default: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD']
     */
    allowedMethods?: string[];

    /**
     * Allowed headers (optional)
     * Default: ['*']
     */
    allowedHeaders?: string[];

    /**
     * Max age seconds for preflight cache (optional)
     * Default: 3600
     */
    maxAgeSeconds?: number;

    /**
     * Headers exposed to the client (optional)
     * Default: ['ETag', 'Content-Length', 'Content-Type']
     */
    exposeHeaders?: string[];

    /**
     * Status code for OPTIONS response (optional)
     * Default: 204
     */
    optionsSuccessStatus?: number;
}

/**
 * R2 CORS Configuration Response
 */
export interface R2CorsConfigResponse {
    /** Request succeeded */
    success: boolean;

    /** Message from API */
    message: string;

    /** Applied CORS configuration */
    configuration: {
        CORSRules: Array<{
            /** Headers allowed in cross-origin requests */
            AllowedHeaders: string[];

            /** HTTP methods allowed */
            AllowedMethods: string[];

            /** Origins allowed to make requests */
            AllowedOrigins: string[];

            /** Headers exposed to the client */
            ExposeHeaders: string[];

            /** How long (seconds) the browser can cache the CORS response */
            MaxAgeSeconds: number;
        }>;
    };
}

/**
 * R2 CORS Verification Options
 */
export interface R2CorsVerifyOptions {
    /** R2 Access Key ID */
    r2AccessKey: string;

    /** R2 Secret Access Key */
    r2SecretKey: string;

    /** R2 Bucket name */
    r2Bucket: string;

    /** Cloudflare Account ID */
    r2AccountId: string;
}

/**
 * R2 CORS Verification Response
 */
export interface R2CorsVerifyResponse {
    /** Request succeeded */
    success: boolean;

    /** Message from API */
    message: string;

    /** Whether CORS is configured */
    configured: boolean;

    /** Whether CORS is valid */
    isValid: boolean;

    /** CORS rules (if configured) */
    corsRules?: Array<{
        /** HTTP methods allowed */
        AllowedMethods: string[];

        /** Origins allowed */
        AllowedOrigins: string[];

        /** Headers allowed */
        AllowedHeaders: string[];

        /** Headers exposed */
        ExposeHeaders: string[];
    }>;

    /** Any issues found */
    issues: string[];

    /** Recommendation */
    recommendation: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract R2-specific options from generic options
 */
export type ExtractR2Options<T> = T extends { provider: 'R2' } ? T : never;
