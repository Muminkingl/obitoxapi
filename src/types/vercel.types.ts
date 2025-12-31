/**
 * Vercel Provider Types
 * 
 * Type definitions specific to Vercel Blob storage.
 * Vercel provides simple, scalable object storage with automatic CDN distribution.
 * 
 * @module types/vercel
 */

import { BaseUploadOptions, BaseDeleteOptions, BaseDownloadOptions } from './common';

// ============================================================================
// Vercel Upload Options
// ============================================================================

/**
 * Vercel-specific upload options
 * 
 * @example
 * ```typescript
 * const options: VercelUploadOptions = {
 *   filename: 'avatar.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'VERCEL',
 *   vercelToken: 'vercel_blob_rw_xxx...'
 * };
 * ```
 */
export interface VercelUploadOptions extends BaseUploadOptions {
    /** Must be 'VERCEL' */
    provider: 'VERCEL';

    /**
     * Vercel Blob storage token
     * Get this from: https://vercel.com/account/tokens
     * Format: vercel_blob_rw_xxxxx...
     */
    vercelToken: string;
}

// ============================================================================
// Vercel Delete Options
// ============================================================================

/**
 * Vercel-specific delete options
 * 
 * @example
 * ```typescript
 * const options: VercelDeleteOptions = {
 *   fileUrl: 'https://xxx.public.blob.vercel-storage.com/avatar.jpg',
 *   provider: 'VERCEL',
 *   vercelToken: 'vercel_blob_rw_xxx...'
 * };
 * ```
 */
export interface VercelDeleteOptions extends BaseDeleteOptions {
    /** Must be 'VERCEL' */
    provider: 'VERCEL';

    /**
     * Vercel Blob storage token
     * Must have write permissions
     */
    vercelToken: string;
}

// ============================================================================
// Vercel Download Options
// ============================================================================

/**
 * Vercel-specific download options
 * 
 * Note: Vercel Blob files are publicly accessible by default.
 * No signed URLs needed for downloads.
 * 
 * @example
 * ```typescript
 * const options: VercelDownloadOptions = {
 *   fileUrl: 'https://xxx.public.blob.vercel-storage.com/avatar.jpg',
 *   provider: 'VERCEL'
 * };
 * ```
 */
export interface VercelDownloadOptions extends BaseDownloadOptions {
    /** Must be 'VERCEL' */
    provider: 'VERCEL';

    /**
     * Vercel token (optional for public files)
     * Only needed for private blob stores
     */
    vercelToken?: string;
}

// ============================================================================
// Vercel Cancel Options
// ============================================================================

/**
 * Vercel-specific upload cancellation options
 */
export interface VercelCancelOptions {
    /** Upload ID to cancel */
    uploadId: string;

    /** Must be 'VERCEL' */
    provider: 'VERCEL';

    /** Vercel Blob storage token */
    vercelToken: string;
}

// ============================================================================
// Vercel Response Types
// ============================================================================

/**
 * Vercel Blob upload response
 */
export interface VercelBlobResponse {
    /** Public URL of the uploaded blob */
    url: string;

    /** Download URL (same as url for Vercel) */
    downloadUrl: string;

    /** Pathname (filename part of the URL) */
    pathname: string;

    /** Content type */
    contentType: string;

    /** Content disposition */
    contentDisposition: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract Vercel-specific options from generic options
 */
export type ExtractVercelOptions<T> = T extends { provider: 'VERCEL' } ? T : never;
