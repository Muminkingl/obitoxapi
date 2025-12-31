/**
 * Supabase Provider Types
 * 
 * Type definitions specific to Supabase Storage.
 * Supabase provides S3-compatible object storage with fine-grained access control.
 * 
 * @module types/supabase
 */

import { BaseUploadOptions, BaseDeleteOptions, BaseDownloadOptions, BucketInfo } from './common';

// ============================================================================
// Supabase Upload Options
// ============================================================================

/**
 * Supabase-specific upload options
 * 
 * @example
 * ```typescript
 * const options: SupabaseUploadOptions = {
 *   filename: 'document.pdf',
 *   contentType: 'application/pdf',
 *   provider: 'SUPABASE',
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
 *   bucket: 'documents',
 *   expiresIn: 3600  // 1 hour
 * };
 * ```
 */
export interface SupabaseUploadOptions extends BaseUploadOptions {
    /** Must be 'SUPABASE' */
    provider: 'SUPABASE';

    /**
     * Supabase project URL
     * Format: https://xxxxx.supabase.co
     * Find in: Project Settings → API
     */
    supabaseUrl: string;

    /**
     * Supabase service role key (secret!)
     * Get from: Project Settings → API → service_role key
     * ⚠️ Keep this secret - never expose in client-side code
     */
    supabaseToken: string;

    /**
     * Bucket name to upload to
     * Create buckets in: Storage → Create bucket
     */
    bucket: string;

    /**
     * Signed URL expiration (seconds)
     * For private buckets, this controls how long the upload URL is valid
     * Default: 3600 (1 hour)
     */
    expiresIn?: number;
}

// ============================================================================
// Supabase Delete Options
// ============================================================================

/**
 * Supabase-specific delete options
 * 
 * @example
 * ```typescript
 * const options: SupabaseDeleteOptions = {
 *   fileUrl: 'https://xxx.supabase.co/storage/v1/object/public/documents/file.pdf',
 *   provider: 'SUPABASE',
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
 *   bucket: 'documents'
 * };
 * ```
 */
export interface SupabaseDeleteOptions extends BaseDeleteOptions {
    /** Must be 'SUPABASE' */
    provider: 'SUPABASE';

    /** Supabase project URL */
    supabaseUrl: string;

    /** Supabase service role key */
    supabaseToken: string;

    /** Bucket name */
    bucket: string;
}

// ============================================================================
// Supabase Download Options
// ============================================================================

/**
 * Supabase-specific download options
 * 
 * @example
 * ```typescript
 * // Public bucket (no auth needed)
 * const publicOptions: SupabaseDownloadOptions = {
 *   filename: 'avatar.jpg',
 *   provider: 'SUPABASE',
 *   bucket: 'avatars'
 * };
 * 
 * // Private bucket (requires signed URL)
 * const privateOptions: SupabaseDownloadOptions = {
 *   filename: 'invoice.pdf',
 *   provider: 'SUPABASE',
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
 *   bucket: 'admin',
 *   expiresIn: 300  // 5 minutes
 * };
 * ```
 */
export interface SupabaseDownloadOptions extends BaseDownloadOptions {
    /** Must be 'SUPABASE' */
    provider: 'SUPABASE';

    /** Supabase project URL (required for private buckets) */
    supabaseUrl?: string;

    /** Supabase service role key (required for private buckets) */
    supabaseToken?: string;

    /** Bucket name */
    bucket?: string;

    /**
     * Signed URL expiration (seconds)
     * For private buckets, controls how long the download URL is valid
     * Default: 3600 (1 hour)
     */
    expiresIn?: number;
}

// ============================================================================
// Supabase Bucket Management
// ============================================================================

/**
 * Supabase bucket list options
 */
export interface SupabaseListBucketsOptions {
    /** Must be 'SUPABASE' */
    provider: 'SUPABASE';

    /** Supabase project URL */
    supabaseUrl: string;

    /** Supabase service role key */
    supabaseToken: string;
}

/**
 * Supabase bucket information
 * Extends the common BucketInfo with Supabase-specific fields
 */
export interface SupabaseBucketInfo extends BucketInfo {
    /** Bucket ID */
    id?: string;

    /** Owner ID (user or service that created the bucket) */
    owner?: string;

    /** Allowed MIME types (if restricted) */
    allowedMimeTypes?: string[];

    /** Maximum file size in bytes */
    fileSizeLimit?: number;
}

// ============================================================================
// Supabase Cancel Options
// ============================================================================

/**
 * Supabase-specific upload cancellation options
 */
export interface SupabaseCancelOptions {
    /** Upload ID to cancel */
    uploadId: string;

    /** Must be 'SUPABASE' */
    provider: 'SUPABASE';

    /** Supabase project URL */
    supabaseUrl: string;

    /** Supabase service role key */
    supabaseToken: string;

    /** Bucket name */
    bucket: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract Supabase-specific options from generic options
 */
export type ExtractSupabaseOptions<T> = T extends { provider: 'SUPABASE' } ? T : never;
