/**
 * AWS S3 Provider Types
 * 
 * Type definitions specific to AWS S3 storage.
 * S3 provides enterprise-grade object storage with 27 regions, 7 storage classes,
 * and advanced features like SSE-KMS encryption, CloudFront CDN, and object versioning.
 * 
 * Performance Targets:
 * - Single upload: <50ms (presigned URL, pure crypto)
 * - Download URL: <30ms (presigned URL)
 * - Delete: 50-100ms (1 AWS API call)
 * - List: 100-300ms (1 AWS API call)
 * - Metadata: 50-100ms (1 AWS API call)
 * 
 * @module types/s3
 */

import { BaseUploadOptions, BaseDeleteOptions, BaseDownloadOptions, NetworkInfo, ValidationConfig, WebhookConfig } from './common.js';

// ============================================================================
// S3 Configuration (Provider Instance Pattern)
// ============================================================================

/**
 * S3 Provider Configuration
 * 
 * Used to initialize an S3 provider instance with stored credentials.
 * Once configured, all methods use these credentials automatically.
 * 
 * @example
 * ```typescript
 * const s3 = client.s3({
 *   accessKey: 'AKIA...',
 *   secretKey: 'wJalr...',
 *   bucket: 'my-uploads',
 *   region: 'us-east-1',
 *   storageClass: 'INTELLIGENT_TIERING'  // optional
 * });
 * 
 * // All methods now use stored credentials
 * await s3.uploadFile(file);
 * await s3.configureCors({ origins: ['https://app.com'] });
 * ```
 */
export interface S3Config {
    /**
     * AWS Access Key ID
     * Get from: AWS Console → IAM → Users → Security Credentials
     */
    accessKey: string;

    /**
     * AWS Secret Access Key
     */
    secretKey: string;

    /**
     * S3 Bucket name
     */
    bucket: string;

    /**
     * AWS Region
     * @default 'us-east-1'
     */
    region?: string;

    /**
     * Custom S3-compatible endpoint (optional)
     * Use this for S3-compatible services like MinIO, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, Wasabi, etc.
     * 
     * Examples:
     * - MinIO: 'http://localhost:9000'
     * - R2: 'https://{accountId}.r2.cloudflarestorage.com'
     * - DigitalOcean Spaces: 'https://{region}.digitaloceanspaces.com'
     * - Backblaze B2: 'https://s3.{region}.backblazeb2.com'
     * - Wasabi: 'https://s3.{region}.wasabisys.com'
     * - Supabase Storage: 'https://{projectId}.supabase.co/storage/v1/s3'
     * 
     * @default undefined (uses standard AWS S3 endpoint)
     */
    endpoint?: string;

    /**
     * Storage Class
     * @default 'STANDARD'
     */
    storageClass?: 'STANDARD' | 'STANDARD_IA' | 'ONEZONE_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'DEEP_ARCHIVE';

    /**
     * Server-Side Encryption Type
     * @default 'AES256'
     */
    encryptionType?: 'AES256' | 'SSE-KMS';

    /**
     * KMS Key ID (required if encryptionType is 'SSE-KMS')
     */
    kmsKeyId?: string;

    /**
     * CloudFront Distribution Domain (optional)
     * For CDN-accelerated downloads
     */
    cloudFrontDomain?: string;

    /**
     * CloudFront Key Pair ID (optional)
     */
    cloudFrontKeyPairId?: string;

    /**
     * CloudFront Private Key (optional)
     */
    cloudFrontPrivateKey?: string;
}

// ============================================================================
// S3 Upload Options
// ============================================================================

/**
 * S3-specific upload options
 * 
 * @example
 * ```typescript
 * const options: S3UploadOptions = {
 *   filename: 'document.pdf',
 *   contentType: 'application/pdf',
 *   provider: 'S3',
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   s3StorageClass: 'INTELLIGENT_TIERING',
 *   s3EncryptionType: 'SSE-KMS',
 *   s3CloudFrontDomain: 'cdn.myapp.com'
 * };
 * ```
 */
export interface S3UploadOptions extends BaseUploadOptions {
    /** Must be 'S3' */
    provider: 'S3';

    /**
     * AWS Access Key ID
     * Get from: AWS Console → IAM → Users → Security Credentials
     * Format: 20 characters starting with 'AKIA'
     */
    s3AccessKey: string;

    /**
     * AWS Secret Access Key
     * Get from: AWS Console → IAM → Users → Security Credentials
     * Format: 40 characters (base64 encoded)
     */
    s3SecretKey: string;

    /**
     * S3 Bucket name
     * Format: 3-63 characters, lowercase, alphanumeric with hyphens
     * Must be globally unique across all AWS accounts
     */
    s3Bucket: string;

    /**
     * AWS Region (optional)
     * Default: 'us-east-1'
     * Examples: 'us-west-2', 'eu-west-1', 'ap-southeast-1'
     */
    s3Region?: string;

    /**
     * Custom S3-compatible endpoint (optional)
     * Use for S3-compatible services: MinIO, R2, DigitalOcean Spaces, Backblaze B2, Wasabi, etc.
     * 
     * Examples:
     * - MinIO: 'http://localhost:9000'
     * - R2: 'https://{accountId}.r2.cloudflarestorage.com'
     * - DigitalOcean Spaces: 'https://{region}.digitaloceanspaces.com'
     */
    s3Endpoint?: string;

    /**
     * S3 Storage Class (optional)
     * Controls cost vs. access speed
     * 
     * Options:
     * - STANDARD: General purpose (default)
     * - STANDARD_IA: Infrequent access (cheaper, retrieval fee)
     * - ONEZONE_IA: Single AZ infrequent access (20% cheaper than STANDARD_IA)
     * - GLACIER_INSTANT_RETRIEVAL: Archive with instant access
     * - GLACIER_FLEXIBLE_RETRIEVAL: Archive with 1-5 min to 3-5 hr retrieval
     * - GLACIER_DEEP_ARCHIVE: Lowest cost (12-hour retrieval)
     * - INTELLIGENT_TIERING: Auto-optimization based on access patterns
     */
    s3StorageClass?: 'STANDARD' | 'STANDARD_IA' | 'ONEZONE_IA' |
    'GLACIER_INSTANT_RETRIEVAL' | 'GLACIER_FLEXIBLE_RETRIEVAL' |
    'GLACIER_DEEP_ARCHIVE' | 'INTELLIGENT_TIERING';

    /**
     * Server-side encryption type (optional)
     * Default: 'SSE-S3'
     * 
     * Options:
     * - SSE-S3: AWS-managed encryption keys (free)
     * - SSE-KMS: Customer-managed encryption keys (requires s3KmsKeyId)
     */
    s3EncryptionType?: 'SSE-S3' | 'SSE-KMS';

    /**
     * KMS Key ID for SSE-KMS encryption (required if s3EncryptionType = 'SSE-KMS')
     * Format: ARN like 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
     */
    s3KmsKeyId?: string;

    /**
     * CloudFront CDN domain (optional)
     * Use CloudFront for faster global delivery
     * 
     * Examples:
     * - 'd111111abcdef8.cloudfront.net' (CloudFront distribution)
     * - 'cdn.myapp.com' (custom domain)
     */
    s3CloudFrontDomain?: string;

    /**
     * Enable object versioning (optional)
     * If true, S3 will auto-assign version IDs to uploaded objects
     * Note: Versioning must be enabled on the bucket in AWS Console
     */
    s3EnableVersioning?: boolean;

    /**
     * URL expiration time in seconds (optional)
     * Range: 60-604800 seconds (1 minute to 7 days)
     * Default: 3600 (1 hour)
     */
    expiresIn?: number;

    /**
     * Custom file metadata (optional)
     * Key-value pairs attached to the uploaded file
     * Maximum: 2KB total metadata
     */
    metadata?: Record<string, string>;

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

    /**
     * Webhook configuration for upload completion notifications
     * @see WebhookConfig for all available options
     */
    webhook?: WebhookConfig;
}

// ============================================================================
// S3 Multipart Upload Options (for files >100MB)
// ============================================================================

/**
 * S3 multipart upload options
 * For files larger than 100MB, use multipart upload for reliability and resume capability
 * 
 * @example
 * ```typescript
 * const options: S3MultipartUploadOptions = {
 *   filename: 'large-video.mp4',
 *   contentType: 'video/mp4',
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   partSize: 10485760  // 10MB parts
 * };
 * ```
 */
export interface S3MultipartUploadOptions extends Omit<S3UploadOptions, 'provider'> {
    /**
     * Part size in bytes (optional)
     * Range: 5MB-5GB
     * Default: 10MB (10485760 bytes)
     * Recommendation: Use 10MB for most files, increase for very large files
     */
    partSize?: number;
}

// ============================================================================
// S3 Delete Options
// ============================================================================

/**
 * S3-specific delete options
 * 
 * @example
 * ```typescript
 * const options: S3DeleteOptions = {
 *   key: 'uploads/photo.jpg',
 *   provider: 'S3',
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1'
 * };
 * ```
 */
export interface S3DeleteOptions extends BaseDeleteOptions {
    /** Must be 'S3' */
    provider: 'S3';

    /**
     * S3 object key to delete
     * Example: 'uploads/photo.jpg' or 'documents/report.pdf'
     */
    key: string;

    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (optional, default: 'us-east-1') */
    s3Region?: string;
}

// ============================================================================
// S3 Batch Delete Options
// ============================================================================

/**
 * S3 batch delete options
 * Delete up to 1000 files in a single API call
 * 
 * @example
 * ```typescript
 * const options: S3BatchDeleteOptions = {
 *   keys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1'
 * };
 * ```
 */
export interface S3BatchDeleteOptions {
    /**
     * Array of S3 object keys to delete
     * Maximum: 1000 keys per batch (AWS limit)
     */
    keys: string[];

    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (optional, default: 'us-east-1') */
    s3Region?: string;
}

// ============================================================================
// S3 Download Options
// ============================================================================

/**
 * S3-specific download options
 * 
 * @example
 * ```typescript
 * const options: S3DownloadOptions = {
 *   key: 'uploads/photo.jpg',
 *   provider: 'S3',
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   s3CloudFrontDomain: 'cdn.myapp.com',
 *   expiresIn: 3600,
 *   responseContentDisposition: 'attachment; filename="photo.jpg"'
 * };
 * ```
 */
export interface S3DownloadOptions extends BaseDownloadOptions {
    /** Must be 'S3' */
    provider: 'S3';

    /**
     * S3 object key to download
     * Example: 'uploads/photo.jpg' or 'documents/report.pdf'
     */
    key: string;

    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (optional, default: 'us-east-1') */
    s3Region?: string;

    /**
     * CloudFront CDN domain (optional)
     * If provided, response will include a CDN URL
     */
    s3CloudFrontDomain?: string;

    /**
     * URL expiration time in seconds (optional)
     * Range: 60-604800 seconds (1 minute to 7 days)
     * Default: 3600 (1 hour)
     */
    expiresIn?: number;

    /**
     * Override response Content-Type header (optional)
     * Example: 'application/json', 'text/plain'
     */
    responseContentType?: string;

    /**
     * Override response Content-Disposition header (optional)
     * Examples:
     * - 'attachment; filename="photo.jpg"' (force download)
     * - 'inline' (display in browser)
     */
    responseContentDisposition?: string;
}

// ============================================================================
// S3 List Options
// ============================================================================

/**
 * S3 file listing options
 * List and browse files in an S3 bucket
 * 
 * @example
 * ```typescript
 * const options: S3ListOptions = {
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   prefix: 'documents/',
 *   maxKeys: 100
 * };
 * ```
 */
export interface S3ListOptions {
    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (optional, default: 'us-east-1') */
    s3Region?: string;

    /**
     * Filter results by prefix (optional)
     * Example: 'documents/' lists only files in documents folder
     */
    prefix?: string;

    /**
     * Maximum number of results to return
     * Range: 1-1000 (AWS limit)
     * Default: 1000
     */
    maxKeys?: number;

    /**
     * Continuation token for pagination (optional)
     * Returned from previous list request
     */
    continuationToken?: string;
}

// ============================================================================
// S3 Metadata Options
// ============================================================================

/**
 * S3 metadata retrieval options
 * Get file information without downloading the file
 * 
 * @example
 * ```typescript
 * const options: S3MetadataOptions = {
 *   key: 'uploads/photo.jpg',
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   versionId: 'abc123...'  // Optional: get metadata for specific version
 * };
 * ```
 */
export interface S3MetadataOptions {
    /**
     * S3 object key
     * Example: 'uploads/photo.jpg'
     */
    key: string;

    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (optional, default: 'us-east-1') */
    s3Region?: string;

    /**
     * Version ID (optional)
     * If provided, gets metadata for specific version of the object
     */
    versionId?: string;
}

// ============================================================================
// S3 Response Types
// ============================================================================

/**
 * S3 upload response
 */
export interface S3UploadResponse {
    /** Request succeeded */
    success: true;

    /** Presigned URL for PUT request */
    uploadUrl: string;

    /** Final public URL where file will be accessible */
    publicUrl: string;

    /** CloudFront CDN URL (if s3CloudFrontDomain was provided) */
    cdnUrl?: string;

    /** S3 object key */
    key: string;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** Storage class */
    storageClass: string;

    /** Encryption type */
    encryption: {
        type: string;
        algorithm: string;
        kmsKeyId?: string;
    };

    /** URL expiration time in seconds */
    expiresIn: number;

    /** Performance metrics (optional) */
    performance?: {
        /** Total request time */
        totalTime: string;

        /** Time breakdown */
        breakdown?: {
            /** Memory guard check time */
            memoryGuard: string;

            /** Crypto signing time (ZERO API calls!) */
            cryptoSigning: string;
        };
    };
}

/**
 * S3 multipart upload initiation response
 */
export interface S3MultipartInitResponse {
    /** Request succeeded */
    success: true;

    /** Unique upload ID for this multipart upload */
    uploadId: string;

    /** Array of presigned URLs for each part */
    partUrls: string[];

    /** S3 object key */
    key: string;

    /** Total number of parts */
    partsCount: number;

    /** Part size in bytes */
    partSize: number;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** Instructions for completing upload */
    instructions: {
        step1: string;
        step2: string;
        step3: string;
    };
}

/**
 * S3 download response
 */
export interface S3DownloadResponse {
    /** Request succeeded */
    success: true;

    /** Presigned GET URL for downloading */
    downloadUrl: string;

    /** Public URL (if bucket is public) */
    publicUrl: string;

    /** CloudFront CDN URL (if s3CloudFrontDomain was provided) */
    cdnUrl?: string;

    /** S3 object key */
    key: string;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** URL expiration time in seconds */
    expiresIn: number;

    /** URL expiration timestamp */
    expiresAt: string;

    /** Usage hint */
    hint: string;
}

/**
 * S3 delete response
 */
export interface S3DeleteResponse {
    /** Request succeeded */
    success: true;

    /** Deleted object key */
    deleted: string;

    /** Deletion timestamp */
    deletedAt: string;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** Version ID (if versioning enabled) */
    versionId?: string;

    /** Whether object was marked as deleted (versioning) */
    deleteMarker: boolean;
}

/**
 * S3 batch delete response
 */
export interface S3BatchDeleteResponse {
    /** Request succeeded */
    success: true;

    /** Array of successfully deleted object keys */
    deleted: string[];

    /** Number of successfully deleted objects */
    deletedCount: number;

    /** Array of errors (if any) */
    errors: Array<{
        key: string;
        code: string;
        message: string;
    }>;

    /** Number of errors */
    errorCount: number;

    /** Deletion timestamp */
    deletedAt: string;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;
}

/**
 * S3 list files response
 */
export interface S3ListResponse {
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

        /** Storage class */
        storageClass: string;

        /** Object owner (if available) */
        owner?: string;
    }>;

    /** Number of files returned */
    count: number;

    /** Whether there are more results */
    isTruncated: boolean;

    /** Continuation token for next page (if isTruncated) */
    nextContinuationToken?: string;

    /** Prefix used for filtering (if provided) */
    prefix?: string;

    /** Maximum keys per request */
    maxKeys: number;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** Usage hint */
    hint: string;
}

/**
 * S3 metadata response
 */
export interface S3MetadataResponse {
    /** Request succeeded */
    success: true;

    /** File metadata */
    metadata: {
        /** Object key */
        key: string;

        /** File size in bytes */
        size: number;

        /** Human-readable file size */
        sizeFormatted: string;

        /** Content type */
        contentType: string;

        /** Last modification timestamp */
        lastModified: string;

        /** ETag (entity tag) */
        etag: string;

        /** Version ID (if versioning enabled) */
        versionId?: string;

        /** Storage class */
        storageClass: string;

        /** Encryption information */
        encryption: {
            serverSideEncryption: string;
            kmsKeyId?: string;
            bucketKeyEnabled: boolean;
        };

        /** Custom metadata (user-defined key-value pairs) */
        customMetadata: Record<string, string>;

        /** Cache control header */
        cacheControl?: string;

        /** Content disposition header */
        contentDisposition?: string;
    };

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** Performance benefits */
    savings: {
        dataTransfer: string;
        speedImprovement: string;
    };

    /** Usage hint */
    hint: string;
}

// ============================================================================
// S3 CORS Configuration Types (Option A: Backend Auto-Configuration)
// ============================================================================

/**
 * S3 CORS Configuration Options
 * 
 * Options for configuring CORS on an S3 bucket to enable direct browser uploads.
 * This is Option A: Backend Auto-Configuration.
 * 
 * @example
 * ```typescript
 * const options: S3CorsConfigOptions = {
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'xxx...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   allowedOrigins: ['https://myapp.com', 'https://www.myapp.com']
 * };
 * ```
 */
export interface S3CorsConfigOptions {
    /**
     * AWS Access Key ID
     * Get from: AWS Console → IAM → Users → Security Credentials
     */
    s3AccessKey: string;

    /**
     * AWS Secret Access Key
     * Get from: AWS Console → IAM → Users → Security Credentials
     */
    s3SecretKey: string;

    /**
     * S3 Bucket name
     * The bucket to configure CORS on
     */
    s3Bucket: string;

    /**
     * AWS Region (optional)
     * Default: 'us-east-1'
     */
    s3Region?: string;

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
     * Default: []
     */
    exposeHeaders?: string[];

    /**
     * Status code for OPTIONS response (optional)
     * Default: 204
     */
    optionsSuccessStatus?: number;
}

/**
 * S3 CORS Configuration Response
 */
export interface S3CorsConfigResponse {
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
 * S3 CORS Verification Response
 */
export interface S3CorsVerifyResponse {
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
 * Extract S3-specific options from generic options
 */
export type ExtractS3Options<T> = T extends { provider: 'S3' } ? T : never;

/**
 * S3 CORS Verification Options
 */
export interface S3CorsVerifyOptions {
    s3AccessKey: string;
    s3SecretKey: string;
    s3Bucket: string;
    s3Region?: string;
}

// ============================================================================
// S3 Batch Upload Types
// ============================================================================

/**
 * S3 batch upload file descriptor
 */
export interface S3BatchFile {
    /** Filename for each file */
    filename: string;

    /** MIME type for each file */
    contentType: string;

    /** File size in bytes (optional) */
    fileSize?: number;
}

/**
 * S3 batch upload options
 * Upload up to 100 files with validation + smart expiry
 * 
 * @example
 * ```typescript
 * const options: S3BatchUploadOptions = {
 *   files: [
 *     { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
 *     { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 }
 *   ],
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   // Validation preset
 *   validation: 'images',
 *   // Smart expiry
 *   networkInfo: { effectiveType: '4g' }
 * };
 * ```
 */
export interface S3BatchUploadOptions {
    /**
     * Array of files to upload
     * Maximum: 100 files per batch
     */
    files: S3BatchFile[];

    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (optional, default: 'us-east-1') */
    s3Region?: string;

    /**
     * Custom S3-compatible endpoint (optional)
     * For MinIO, R2, DigitalOcean Spaces, Backblaze B2, etc.
     */
    s3Endpoint?: string;

    /**
     * S3 Storage Class (optional)
     * Default: 'STANDARD'
     */
    s3StorageClass?: 'STANDARD' | 'STANDARD_IA' | 'ONEZONE_IA' |
    'GLACIER_INSTANT_RETRIEVAL' | 'GLACIER_FLEXIBLE_RETRIEVAL' |
    'GLACIER_DEEP_ARCHIVE' | 'INTELLIGENT_TIERING';

    /**
     * Server-side encryption type (optional)
     * Default: 'SSE-S3'
     */
    s3EncryptionType?: 'SSE-S3' | 'SSE-KMS';

    /** KMS Key ID for SSE-KMS (optional) */
    s3KmsKeyId?: string;

    /** CloudFront CDN domain (optional) */
    s3CloudFrontDomain?: string;

    /** URL expiration time in seconds (optional) */
    expiresIn?: number;

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

/**
 * S3 batch upload result for a single file
 */
export interface S3BatchUploadResult {
    /** Request succeeded for this file */
    success: boolean;

    /** File index in the batch */
    index: number;

    /** Original filename */
    originalFilename: string;

    /** Generated S3 object key */
    uploadFilename?: string;

    /** Presigned PUT URL for upload */
    uploadUrl?: string;

    /** Public URL after upload */
    publicUrl?: string;

    /** CloudFront CDN URL (if configured) */
    cdnUrl?: string;

    /** Content type */
    contentType?: string;

    /** File size in bytes */
    fileSize?: number;

    /** URL expiration time in seconds */
    expiresIn?: number;

    /** URL expiration timestamp */
    expiresAt?: string;

    /** Smart expiry details (if enabled) */
    smartExpiry?: {
        calculatedExpiry: number;
        estimatedUploadTime: number;
        networkType: string;
        bufferTime: number;
        reasoning: Record<string, any>;
    };

    /** Storage class */
    storageClass?: string;

    /** Encryption details */
    encryption?: {
        type: string;
        algorithm: string;
    };

    /** Error details (if success = false) */
    error?: string;
    message?: string;
}

/**
 * S3 batch upload response
 */
export interface S3BatchUploadResponse {
    /** Request succeeded */
    success: boolean;

    /** Provider identifier */
    provider: 's3';

    /** AWS region */
    region: string;

    /** Array of results for each file */
    results: S3BatchUploadResult[];

    /** Summary statistics */
    summary: {
        /** Total files in batch */
        total: number;

        /** Successfully generated URLs */
        successful: number;

        /** Failed files */
        failed: number;
    };

    /** Performance metrics */
    performance?: {
        /** Unique request ID */
        requestId: string;

        /** Total request time */
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
