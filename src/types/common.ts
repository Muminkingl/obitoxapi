/**
 * Common Types for ObitoX SDK
 * 
 * Shared interfaces and types used across all providers.
 * These types define the core configuration, responses, and common data structures.
 * 
 * @module types/common
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * ObitoX SDK Configuration
 * @property apiKey - Your ObitoX API key for authentication (public key: ox_...)
 * @property apiSecret - Your ObitoX API secret for request signing (secret key: sk_...)
 * @property baseUrl - Optional custom API base URL (defaults to production)
 */
export interface ObitoXConfig {
    apiKey: string;
    apiSecret?: string;  // Optional for backwards compatibility
    baseUrl?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported storage providers
 */
export type StorageProvider = 'SUPABASE' | 'UPLOADCARE' | 'R2' | 'S3';

/**
 * Legacy provider types for backward compatibility
 * @deprecated Use StorageProvider instead
 */
export type LegacyProvider = 'AWS' | 'CLOUDINARY';

/**
 * All supported providers (including legacy)
 */
export type AllProviders = StorageProvider | LegacyProvider;

// ============================================================================
// Network Information (Shared)
// ============================================================================

/**
 * Network information for smart presigned URL expiry
 * Auto-detected from Navigator.connection API in browsers
 */
export interface NetworkInfo {
    /** Network type: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown' */
    effectiveType?: string;
    /** Actual download speed in Mbps (if available) */
    downlink?: number;
    /** Round-trip time in ms */
    rtt?: number;
}

// ============================================================================
// File Validation Types
// ============================================================================

/**
 * Validation presets for common use cases
 */
export type ValidationPreset = 'images' | 'documents' | 'videos' | 'audio' | 'archives' | 'any';

/**
 * File validation configuration
 * 
 * @example
 * ```typescript
 * // Use a preset
 * const validation: ValidationConfig = 'images';
 * 
 * // Custom configuration
 * const validation: ValidationConfig = {
 *   maxSize: 10 * 1024 * 1024,  // 10MB
 *   allowedTypes: ['image/*'],
 *   blockDangerous: true
 * };
 * ```
 */
export interface ValidationConfig {
    /** 
     * Preset for common validation scenarios
     * Use preset OR custom config (not both)
     */
    preset?: ValidationPreset;

    /**
     * Maximum file size in bytes
     * Default: 100MB (104857600 bytes)
     */
    maxSize?: number;

    /**
     * Minimum file size in bytes
     * Default: 1 byte
     */
    minSize?: number;

    /**
     * Allowed MIME type patterns
     * Examples: ['image/*', 'video/mp4', 'application/pdf']
     */
    allowedTypes?: string[];

    /**
     * Blocked MIME type patterns
     * Examples: ['application/x-msdownload']
     */
    blockedTypes?: string[];

    /**
     * Allowed file extensions (with or without dot)
     * Examples: ['.jpg', 'png', 'mp4']
     */
    allowedExtensions?: string[];

    /**
     * Blocked file extensions (with or without dot)
     * Examples: ['.exe', 'bat', 'sh']
     */
    blockedExtensions?: string[];

    /**
     * Block known dangerous file types
     * Default: true
     */
    blockDangerous?: boolean;

    /**
     * Validate magic bytes to detect MIME spoofing
     * Default: true
     */
    checkMagicBytes?: boolean;

    /**
     * Callback when validation starts
     */
    onStart?: () => void;

    /**
     * Callback when validation completes
     * @param result - Validation result
     */
    onComplete?: (result: ValidationResult) => void;

    /**
     * Callback when validation fails
     * @param errors - Array of error messages
     */
    onError?: (errors: string[]) => void;
}

/**
 * Individual validation check result
 */
export interface ValidationCheck {
    /** Whether this check passed */
    passed: boolean;
    /** Error message if failed */
    error?: string;
    /** Additional details */
    details?: any;
}

/**
 * File validation result
 */
export interface ValidationResult {
    /** Whether all validation checks passed */
    valid: boolean;

    /** Size check result */
    size: ValidationCheck;

    /** Extension check result */
    extension: ValidationCheck;

    /** MIME type check result */
    mimeType: ValidationCheck;

    /** Magic bytes check result */
    magicBytes: ValidationCheck & {
        /** Detected MIME type from magic bytes */
        detectedType?: string | null;
        /** Whether declared type matches detected */
        typeMismatch?: boolean;
    };

    /** Dangerous file check result */
    dangerous: ValidationCheck;

    /** Filename sanitization result */
    filename: ValidationCheck & {
        /** Sanitized filename */
        sanitized?: string;
    };

    /** Aggregated error messages */
    errors: string[];

    /** Aggregated warnings */
    warnings: string[];

    /** File information */
    file: {
        /** Original filename */
        originalName: string;
        /** Sanitized filename */
        sanitizedName: string;
        /** File size in bytes */
        size: number;
        /** Formatted file size (e.g., "5.2 MB") */
        sizeFormatted: string;
        /** File extension */
        extension: string;
        /** Declared MIME type (from File object) */
        declaredType: string;
        /** Detected MIME type (from magic bytes) */
        detectedType: string | null;
    };
}

/**
 * Validation error thrown when file fails validation
 */
export class ValidationError extends Error {
    /** Validation result */
    result: ValidationResult;

    constructor(result: ValidationResult) {
        super(`File validation failed: ${result.errors.join(', ')}`);
        this.name = 'ValidationError';
        this.result = result;
    }
}

// ============================================================================
// Base Options Interfaces
// ============================================================================

/**
 * Base upload options shared across all providers
 */
export interface BaseUploadOptions {
    /** Original filename */
    filename: string;

    /** MIME type of the file */
    contentType?: string;

    /** File size in bytes (optional, for validation) */
    fileSize?: number;

    /** Signed URL expiration time in seconds (provider-specific) */
    expiresIn?: number;

    /** Progress callback - track upload progress */
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void;

    /** Cancel callback - called when upload is cancelled */
    onCancel?: () => void;
}

/**
 * Base delete options shared across all providers
 */
export interface BaseDeleteOptions {
    /** URL or key of the file to delete */
    fileUrl: string;
}

/**
 * Base download options shared across all providers
 */
export interface BaseDownloadOptions {
    /** URL of the file to download (optional if filename provided) */
    fileUrl?: string;

    /** Filename to download (optional if fileUrl provided) */
    filename?: string;

    /** Bucket name (for providers that support buckets) */
    bucket?: string;

    /** Signed URL expiration time in seconds */
    expiresIn?: number;
}

// ============================================================================
// Response Interfaces
// ============================================================================

/**
 * Generic API response structure
 * @template T - Type of the response data
 */
export interface ApiResponse<T = any> {
    /** Whether the request was successful */
    success: boolean;

    /** Human-readable message */
    message?: string;

    /** Response data payload */
    data?: T;

    /** Error details (if success is false) */
    error?: {
        code?: string;
        message: string;
        details?: any;
    };
}

/**
 * Upload response from signed URL generation
 */
export interface UploadResponse {
    /** Whether the request was successful */
    success: boolean;

    /** Upload data */
    data: {
        /** Presigned URL for uploading the file */
        uploadUrl: string;

        /** Public URL where the file will be accessible after upload */
        fileUrl: string;

        /** Final filename (may be different from original) */
        filename: string;

        /** HTTP method to use for upload (usually PUT or POST) */
        method: string;

        /** Upload token (Supabase only) */
        token?: string;

        /** Bucket name (for bucket-based providers) */
        bucket?: string;

        /** Form data parameters (Uploadcare only) */
        formData?: Record<string, string>;
    };

    /** Upload headers configuration */
    upload: {
        /** HTTP headers to include in upload request */
        headers: Record<string, string>;
    };
}

/**
 * Download response with signed URL
 */
export interface DownloadResponse {
    /** Whether the request was successful */
    success: boolean;

    /** Download URL (signed if private bucket) */
    downloadUrl: string;

    /** Filename */
    filename: string;

    /** File size in bytes (if available) */
    fileSize?: number;

    /** MIME type (if available) */
    contentType?: string;

    /** URL expiration time (if applicable) */
    expiresAt?: string;
}

// ============================================================================
// Bucket Management
// ============================================================================

/**
 * Bucket information
 */
export interface BucketInfo {
    /** Bucket name */
    name: string;

    /** Whether the bucket is public */
    public: boolean;

    /** Number of files in bucket (if available) */
    fileCount?: number;

    /** Total size of all files in bytes (if available) */
    totalSize?: number;

    /** Bucket creation date (ISO 8601) */
    createdAt?: string;

    /** Last modification date (ISO 8601) */
    updatedAt?: string;
}

// ============================================================================
// Analytics & Tracking
// ============================================================================

/**
 * Event types for upload tracking
 */
export type UploadEvent = 'initiated' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Track upload event options
 */
export interface TrackOptions {
    /** Event type */
    event: UploadEvent;

    /** File URL or identifier */
    fileUrl: string;

    /** Original filename (optional) */
    filename?: string;

    /** File size in bytes (optional) */
    fileSize?: number;

    /** Provider name (optional) */
    provider?: string;

    /** Error message (for failed events) */
    error?: string;
}

/**
 * Generic analytics event options
 */
export interface AnalyticsOptions {
    /** Event name */
    event: string;

    /** File URL or identifier */
    fileUrl: string;

    /** Filename (optional) */
    filename?: string;

    /** File size in bytes (optional) */
    fileSize?: number;

    /** Provider name (optional) */
    provider?: string;

    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Analytics response
 */
export interface AnalyticsResponse {
    /** Whether tracking was successful */
    success: boolean;

    /** Response message */
    message: string;
}

// ============================================================================
// API Key Validation
// ============================================================================

/**
 * API key validation response
 */
export interface ValidateApiKeyResponse {
    /** Whether API key is valid */
    success: boolean;

    /** Validation message */
    message: string;

    /** API key and user data (if valid) */
    data?: {
        /** API key information */
        api_key: {
            /** API key ID */
            id: string;

            /** API key name/label */
            name: string;

            /** API key status (active, disabled, etc.) */
            status: string;

            /** Creation timestamp (ISO 8601) */
            created_at: string;

            /** Last used timestamp (ISO 8601) */
            last_used_at: string;
        };

        /** User information */
        user: {
            /** User ID */
            id: string;

            /** User email */
            email: string;

            /** First name (optional) */
            first_name?: string;

            /** Last name (optional) */
            last_name?: string;
        };

        /** User's plan/tier */
        plan: string;

        /** Additional profile data */
        profile?: any;
    };
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook configuration for upload completion notifications
 * 
 * @example
 * ```typescript
 * // Manual confirmation (client calls confirm after upload)
 * const webhook: WebhookConfig = {
 *   url: 'https://myapp.com/webhooks/upload',
 *   secret: 'webhook_secret_123',
 *   trigger: 'manual',
 *   metadata: { userId: '123' }
 * };
 * 
 * // Auto confirmation (server polls for file)
 * const webhook: WebhookConfig = {
 *   url: 'https://myapp.com/webhooks/upload',
 *   trigger: 'auto'
 * };
 * ```
 */
export interface WebhookConfig {
    /**
     * Webhook URL to receive notifications
     * Must be a valid HTTP/HTTPS URL
     */
    url: string;

    /**
     * Webhook secret for HMAC signature verification (optional)
     * If not provided, a random secret will be generated
     * Use this to verify webhook payloads on your server
     */
    secret?: string;

    /**
     * Trigger mode for webhook delivery
     * - 'manual': Client must call /webhooks/confirm after upload
     * - 'auto': Server polls storage for file and auto-delivers
     * 
     * Default: 'manual'
     */
    trigger?: 'manual' | 'auto';

    /**
     * Custom metadata to include in webhook payload (optional)
     * Useful for passing application-specific data
     */
    metadata?: Record<string, any>;

    /**
     * Whether to automatically confirm upload (optional)
     * Only applies when trigger is 'manual'
     * Default: true
     */
    autoConfirm?: boolean;
}

/**
 * Webhook payload received by your server
 */
export interface WebhookPayload {
    /** Event type */
    event: 'upload.completed';

    /** Webhook ID */
    webhookId: string;

    /** Timestamp of webhook delivery */
    timestamp: string;

    /** File information */
    file: {
        /** Public URL of the uploaded file */
        url: string;

        /** Original filename */
        filename: string;

        /** File key in storage */
        key: string;

        /** File size in bytes */
        size: number;

        /** MIME type */
        contentType: string;

        /** ETag from storage provider */
        etag?: string;

        /** Last modified timestamp */
        lastModified?: string;
    };

    /** Storage provider */
    provider: string;

    /** Bucket name */
    bucket: string;

    /** Custom metadata from request */
    metadata: Record<string, any>;
}

/**
 * Webhook status response
 */
export interface WebhookStatus {
    /** Webhook ID */
    id: string;

    /** Current status */
    status: 'pending' | 'verifying' | 'delivering' | 'completed' | 'failed' | 'dead_letter';

    /** Provider name */
    provider: string;

    /** Filename */
    filename: string;

    /** Creation timestamp */
    createdAt: string;

    /** Delivery timestamp (if completed) */
    deliveredAt?: string;

    /** Failure timestamp (if failed) */
    failedAt?: string;

    /** Number of delivery attempts */
    attemptCount: number;

    /** Last attempt timestamp */
    lastAttemptAt?: string;

    /** Next retry timestamp (if pending) */
    nextRetryAt?: string;

    /** Error message (if failed) */
    errorMessage?: string;

    /** Webhook URL */
    webhookUrl: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make all properties optional
 */
export type PartialOptions<T> = {
    [P in keyof T]?: T[P];
};

/**
 * Extract provider-specific options
 */
export type ProviderOptions<P extends AllProviders> = P extends 'SUPABASE'
    ? { provider: 'SUPABASE' }
    : P extends 'UPLOADCARE'
    ? { provider: 'UPLOADCARE' }
    : P extends 'R2'
    ? { provider: 'R2' }
    : P extends 'S3'
    ? { provider: 'S3' }
    : never;
