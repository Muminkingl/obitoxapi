/**
 * Uploadcare Provider Types
 * 
 * Type definitions specific to Uploadcare CDN.
 * Uploadcare provides intelligent CDN with built-in image optimization and virus scanning.
 * 
 * @module types/uploadcare
 */

import { BaseUploadOptions, BaseDeleteOptions, BaseDownloadOptions } from './common';

// ============================================================================
// Image Optimization
// ============================================================================

/**
 * Image format options for Uploadcare transformations
 */
export type ImageFormat = 'auto' | 'jpeg' | 'png' | 'webp' | 'preserve';

/**
 * Image quality presets
 */
export type ImageQuality = 'normal' | 'better' | 'best' | 'lighter' | 'lightest';

/**
 * Metadata stripping options
 */
export type MetadataStripping = 'all' | 'none' | 'sensitive';

/**
 * Image optimization options for Uploadcare
 * 
 * @example
 * ```typescript
 * // Easy mode - auto optimization
 * const autoOptions: ImageOptimizationOptions = {
 *   auto: true  // Automatically WebP, smart quality, progressive
 * };
 * 
 * // Manual mode - full control
 * const manualOptions: ImageOptimizationOptions = {
 *   format: 'webp',
 *   quality: 'best',
 *   progressive: true,
 *   stripMeta: 'sensitive',
 *   adaptiveQuality: true
 * };
 * ```
 */
export interface ImageOptimizationOptions {
    /**
     * Easy mode - automatic optimization
     * When true, applies: WebP format + smart quality + progressive loading
     * This gives best results for most images
     */
    auto?: boolean;

    /**
     * Image format conversion
     * - 'auto': Let Uploadcare choose best format
     * - 'jpeg': Force JPEG format
     * - 'png': Force PNG format  
     * - 'webp': Force WebP format (recommended for web)
     * - 'preserve': Keep original format
     */
    format?: ImageFormat;

    /**
     * Quality presets
     * - 'normal': Default quality (80-85%)
     * - 'better': Higher quality (85-90%)
     * - 'best': Maximum quality (90-95%)
     * - 'lighter': Lighter file size (70-75%)
     * - 'lightest': Minimum file size (60-65%)
     */
    quality?: ImageQuality;

    /**
     * Progressive JPEG loading
     * Enables progressive rendering for better user experience
     */
    progressive?: boolean;

    /**
     * Metadata stripping
     * - 'all': Remove all metadata (smallest size)
     * - 'none': Keep all metadata
     * - 'sensitive': Remove sensitive data only (GPS, camera info)
     */
    stripMeta?: MetadataStripping;

    /**
     * Adaptive quality (Uploadcare AI)
     * Uses machine learning to choose optimal quality per image
     * Balances quality and file size automatically
     */
    adaptiveQuality?: boolean;
}

// ============================================================================
// Uploadcare Configuration (Provider Instance Pattern)
// ============================================================================

/**
 * Uploadcare Provider Configuration
 * 
 * Used to initialize an Uploadcare provider instance with stored credentials.
 * Once configured, all methods use these credentials automatically.
 * 
 * @example
 * ```typescript
 * const uploadcare = client.uploadcare({
 *   publicKey: 'demopublickey',
 *   secretKey: 'demosecretkey'
 * });
 * 
 * // All methods now use stored credentials
 * await uploadcare.uploadFile(file);
 * await uploadcare.deleteFile(fileUrl);
 * ```
 */
export interface UploadcareConfig {
    /**
     * Uploadcare Public Key
     * Get from: Uploadcare Dashboard → Project Settings
     */
    publicKey: string;

    /**
     * Uploadcare Secret Key
     * Get from: Uploadcare Dashboard → Project Settings
     */
    secretKey: string;
}

// ============================================================================
// Uploadcare Upload Options
// ============================================================================

/**
 * Uploadcare-specific upload options
 * 
 * @example
 * ```typescript
 * const options: UploadcareUploadOptions = {
 *   filename: 'photo.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'UPLOADCARE',
 *   uploadcarePublicKey: 'demopublickey',
 *   uploadcareSecretKey: 'demosecretkey',
 *   checkVirus: true,
 *   imageOptimization: {
 *     auto: true
 *   }
 * };
 * ```
 */
export interface UploadcareUploadOptions extends BaseUploadOptions {
    /** Must be 'UPLOADCARE' */
    provider: 'UPLOADCARE';

    /**
     * Uploadcare public key
     * Get from: Dashboard → Settings → API Keys
     * Safe to expose in client-side code
     */
    uploadcarePublicKey: string;

    /**
     * Uploadcare secret key (optional but recommended)
     * Required for: virus scanning, secure uploads, webhooks
     * ⚠️ Keep this secret - don't expose in client-side code
     */
    uploadcareSecretKey?: string;

    /**
     * Automatic virus scanning
     * Scans file for malware/viruses before storing
     * Infected files are automatically deleted
     * Requires: uploadcareSecretKey
     */
    checkVirus?: boolean;

    /**
     * Image optimization settings
     * Only applies to image files (jpg, png, webp, etc.)
     * Non-images will ignore this option
     */
    imageOptimization?: ImageOptimizationOptions;
}

// ============================================================================
// Uploadcare Delete Options
// ============================================================================

/**
 * Uploadcare-specific delete options
 * 
 * @example
 * ```typescript
 * const options: UploadcareDeleteOptions = {
 *   fileUrl: 'https://ucarecdn.com/uuid/filename.jpg',
 *   provider: 'UPLOADCARE',
 *   uploadcarePublicKey: 'demopublickey',
 *   uploadcareSecretKey: 'demosecretkey'
 * };
 * ```
 */
export interface UploadcareDeleteOptions extends BaseDeleteOptions {
    /** Must be 'UPLOADCARE' */
    provider: 'UPLOADCARE';

    /** Uploadcare public key */
    uploadcarePublicKey: string;

    /** Uploadcare secret key (required for deletions) */
    uploadcareSecretKey: string;
}

// ============================================================================
// Uploadcare Download Options
// ============================================================================

/**
 * Uploadcare-specific download options
 * 
 * Note: Uploadcare files are publicly accessible via CDN by default.
 * Image transformations are applied via URL parameters.
 * 
 * @example
 * ```typescript
 * const options: UploadcareDownloadOptions = {
 *   fileUrl: 'https://ucarecdn.com/uuid/photo.jpg',
 *   provider: 'UPLOADCARE',
 *   uploadcarePublicKey: 'demopublickey'
 * };
 * ```
 */
export interface UploadcareDownloadOptions extends BaseDownloadOptions {
    /** Must be 'UPLOADCARE' */
    provider: 'UPLOADCARE';

    /** Uploadcare public key */
    uploadcarePublicKey: string;

    /** Uploadcare secret key (optional) */
    uploadcareSecretKey?: string;
}

// ============================================================================
// Virus Scanning
// ============================================================================

/**
 * Malware scan request options
 */
export interface MalwareScanOptions {
    /** File URL to scan */
    fileUrl: string;

    /** Must be 'UPLOADCARE' */
    provider: 'UPLOADCARE';

    /** Uploadcare public key */
    uploadcarePublicKey: string;

    /** Uploadcare secret key (required for scanning) */
    uploadcareSecretKey: string;
}

/**
 * Malware scan status check options
 */
export interface MalwareScanStatusOptions {
    /** Scan request ID */
    requestId: string;

    /** Must be 'UPLOADCARE' */
    provider: 'UPLOADCARE';

    /** Uploadcare public key */
    uploadcarePublicKey: string;

    /** Uploadcare secret key */
    uploadcareSecretKey: string;
}

/**
 * Malware scan results
 */
export interface MalwareScanResults {
    /** Whether file is infected */
    isInfected: boolean;

    /** Virus/malware name (if infected) */
    infectedWith?: string;

    /** Scan completion status */
    isComplete: boolean;

    /** Scan timestamp */
    scannedAt?: string;
}

// ============================================================================
// Uploadcare Cancel Options
// ============================================================================

/**
 * Uploadcare-specific upload cancellation options
 */
export interface UploadcareCancelOptions {
    /** Upload ID to cancel */
    uploadId: string;

    /** Must be 'UPLOADCARE' */
    provider: 'UPLOADCARE';

    /** Uploadcare public key */
    uploadcarePublicKey: string;

    /** Uploadcare secret key (optional) */
    uploadcareSecretKey?: string;
}

// ============================================================================
// Uploadcare Response Types
// ============================================================================

/**
 * Uploadcare file upload response
 */
export interface UploadcareFileResponse {
    /** File UUID */
    file: string;

    /** CDN URL */
    cdnUrl: string;

    /** Original filename */
    originalFilename: string;

    /** File size in bytes */
    size: number;

    /** MIME type */
    mimeType: string;

    /** Whether file is an image */
    isImage: boolean;

    /** Image dimensions (if applicable) */
    imageInfo?: {
        width: number;
        height: number;
        format: string;
    };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract Uploadcare-specific options from generic options
 */
export type ExtractUploadcareOptions<T> = T extends { provider: 'UPLOADCARE' } ? T : never;

/**
 * Check if file is optimizable image type
 */
export type OptimizableImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/bmp';
