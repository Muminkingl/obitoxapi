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
 * @property apiKey - Your ObitoX API key for authentication
 * @property baseUrl - Optional custom API base URL (defaults to production)
 */
export interface ObitoXConfig {
    apiKey: string;
    baseUrl?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Supported storage providers
 */
export type StorageProvider = 'VERCEL' | 'SUPABASE' | 'UPLOADCARE' | 'R2';

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
export type ProviderOptions<P extends AllProviders> = P extends 'VERCEL'
    ? { provider: 'VERCEL' }
    : P extends 'SUPABASE'
    ? { provider: 'SUPABASE' }
    : P extends 'UPLOADCARE'
    ? { provider: 'UPLOADCARE' }
    : P extends 'R2'
    ? { provider: 'R2' }
    : never;
