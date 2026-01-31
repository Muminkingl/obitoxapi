/**
 * Uploadcare Utility Functions
 * 
 * Helper functions for Uploadcare-specific operations.
 * Includes image optimization URL building and file type detection.
 * 
 * @module providers/uploadcare/utils
 */

import type { ImageOptimizationOptions } from '../../types/uploadcare.types';

/**
 * Build optimized Uploadcare URL with image transformations
 * 
 * Applies Uploadcare CDN transformations to optimize images.
 * Supports format conversion, quality adjustment, progressive loading, etc.
 * 
 * @param baseUrl - Base Uploadcare CDN URL
 * @param optimization - Image optimization options
 * @param filename - Original filename for validation
 * @param contentType - MIME type for validation
 * @returns Optimized URL with transformation parameters
 * @throws Error if file is not an image or URL format is invalid
 * 
 * @example
 * ```typescript
 * const optimizedUrl = buildOptimizedUploadcareUrl(
 *   'https://ucarecdn.com/uuid/photo.jpg',
 *   { auto: true },
 *   'photo.jpg',
 *   'image/jpeg'
 * );
 * // Returns: https://ucarecdn.com/uuid/-/preview/-/format/webp/-/quality/smart/-/progressive/yes/photo.jpg
 * ```
 */
export function buildOptimizedUploadcareUrl(
    baseUrl: string,
    optimization: ImageOptimizationOptions,
    filename: string,
    contentType: string
): string {
    // Validate inputs
    if (!baseUrl || !optimization) {
        throw new Error('Invalid parameters: baseUrl and optimization are required');
    }

    // Check if file is an image
    if (!isImageFile(filename, contentType)) {
        throw new Error(
            `Image optimization can only be applied to image files. File "${filename}" (${contentType}) is not an image.`
        );
    }

    // Extract components from the URL (format: https://domain.com/uuid/filename)
    const urlParts = baseUrl.split('/');
    if (urlParts.length < 4) {
        throw new Error('Invalid Uploadcare URL format');
    }

    const domain = urlParts.slice(0, 3).join('/'); // https://ucarecdn.com
    const uuid = urlParts[urlParts.length - 2];
    const urlFilename = urlParts[urlParts.length - 1];

    // Validate UUID format (basic check)
    if (!uuid || uuid.length < 8) {
        throw new Error('Invalid UUID in Uploadcare URL');
    }

    // Build transformation string
    const transformations: string[] = [];

    // Uploadcare requires at least one size operation when using transformations
    // 'preview' produces the biggest possible image without changing dimensions
    transformations.push('preview');

    // Auto mode - apply best optimization settings automatically
    if (optimization.auto === true) {
        // Auto mode: WebP format + smart quality + progressive loading
        transformations.push('format/webp');
        transformations.push('quality/smart');
        transformations.push('progressive/yes');
    } else {
        // Manual mode - use individual settings

        // Format transformation
        if (optimization.format && optimization.format !== 'auto') {
            transformations.push(`format/${optimization.format}`);
        }

        // Quality transformation - map presets to Uploadcare values
        // Uploadcare supports: best, better, normal, lighter, lightest, smart
        if (optimization.quality && optimization.quality !== 'normal') {
            let qualityValue: string;

            switch (optimization.quality) {
                case 'best':
                    qualityValue = 'best'; // Highest quality, largest file
                    break;
                case 'better':
                    qualityValue = 'better'; // High quality
                    break;
                case 'lighter':
                    qualityValue = 'lighter'; // Lower quality, smaller file
                    break;
                case 'lightest':
                    qualityValue = 'lightest'; // Lowest quality, smallest file
                    break;
                default:
                    qualityValue = 'smart'; // AI-powered quality optimization
            }

            transformations.push(`quality/${qualityValue}`);
        }

        // Progressive transformation
        if (optimization.progressive === true) {
            transformations.push('progressive/yes');
        } else if (optimization.progressive === false) {
            transformations.push('progressive/no');
        }

        // Strip meta transformation
        // Note: Currently disabled due to Uploadcare API issues
        // if (optimization.stripMeta && optimization.stripMeta !== 'all') {
        //   transformations.push(`strip_meta/${optimization.stripMeta}`);
        // }
    }

    // Build the optimized URL using Uploadcare transformation syntax
    if (transformations.length > 0) {
        const transformationString = transformations.join('/-/');
        return `${domain}/${uuid}/-/${transformationString}/${urlFilename}`;
    }

    return baseUrl;
}

/**
 * Check if a file is an image based on filename and content type
 * 
 * Checks both MIME type and file extension to determine if file is an image.
 * 
 * @param filename - File name
 * @param contentType - MIME type
 * @returns True if file is an image
 * 
 * @example
 * ```typescript
 * isImageFile('photo.jpg', 'image/jpeg'); // true
 * isImageFile('document.pdf', 'application/pdf'); // false
 * ```
 */
export function isImageFile(filename: string, contentType: string): boolean {
    // Check by content type first (most reliable)
    if (contentType && contentType.startsWith('image/')) {
        return true;
    }

    // Check by file extension as fallback
    const imageExtensions = [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.bmp',
        '.webp',
        '.svg',
        '.tiff',
        '.ico',
        '.avif',
        '.heic',
        '.heif',
    ];

    const lowerFilename = filename.toLowerCase();
    return imageExtensions.some((ext) => lowerFilename.endsWith(ext));
}

/**
 * Extract UUID from Uploadcare URL
 * 
 * @param url - Uploadcare CDN URL
 * @returns UUID or null if not found
 * 
 * @example
 * ```typescript
 * extractUuid('https://ucarecdn.com/abc123-def456/photo.jpg');
 * // Returns: 'abc123-def456'
 * ```
 */
export function extractUuid(url: string): string | null {
    const match = url.match(/\/([a-f0-9-]+)\//i);
    return match ? match[1] : null;
}
