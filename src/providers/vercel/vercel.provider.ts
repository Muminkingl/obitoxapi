/**
 * Vercel Blob Storage Provider
 * 
 * Implementation of Vercel Blob storage for the ObitoX SDK.
 * Uses the Vercel Blob SDK for direct uploads with zero bandwidth cost.
 * 
 * Features:
 * - Direct upload to Vercel Blob (bypasses ObitoX server)
 * - Progress tracking simulation
 * - Upload cancellation support
 * - Public CDN distribution
 * 
 * @module providers/vercel
 */

import { BaseProvider } from '../base.provider.js';
import { put } from '@vercel/blob';
import type {
    VercelUploadOptions,
    VercelDeleteOptions,
    VercelDownloadOptions,
} from '../../types/vercel.types.js';
import type { UploadResponse } from '../../types/common.js';

/**
 * Vercel Blob Provider
 * 
 * Handles all Vercel Blob storage operations.
 * 
 * @example
 * ```typescript
 * const provider = new VercelProvider('your-api-key', 'https://api.obitox.com');
 * 
 * const fileUrl = await provider.upload(file, {
 *   filename: 'avatar.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'VERCEL',
 *   vercelToken: 'vercel_blob_rw_xxx...',
 *   onProgress: (progress) => console.log(`${progress}% uploaded`)
 * });
 * ```
 */
export class VercelProvider extends BaseProvider<
    VercelUploadOptions,
    VercelDeleteOptions,
    VercelDownloadOptions
> {
    constructor(apiKey: string, baseUrl: string, apiSecret?: string) {
        super('VERCEL', apiKey, baseUrl, apiSecret);
    }

    /**
     * Upload file to Vercel Blob storage
     * 
     * Uses the Vercel Blob SDK for direct upload (zero bandwidth cost).
     * Files are automatically distributed via Vercel's global CDN.
     * 
     * @param file - File or Blob to upload
     * @param options - Vercel upload options
     * @returns Promise resolving to the public CDN URL
     * @throws Error if upload fails or token is invalid
     */
    async upload(file: File | Blob, options: Omit<VercelUploadOptions, 'filename' | 'contentType'>): Promise<string> {
        // Validate required fields
        this.validateRequiredFields(options, ['vercelToken']);

        // Extract filename from File object or use default
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        try {
            // Step 1: Get signed URL from ObitoX API
            // This validates the API key and prepares the upload
            const signedUrlResult = await this.getSignedUrl(filename, contentType, options);

            // Step 2: Upload directly to Vercel Blob using their SDK
            const blobUrl = await this.uploadToVercelBlob(
                signedUrlResult.data.filename || filename,
                file,
                options.vercelToken,
                options.onProgress,
                options.onCancel
            );

            // Step 3: Track completion
            await this.trackEvent('completed', blobUrl, {
                filename,
                fileSize: file.size,
            });

            return blobUrl;

        } catch (error) {
            // Track failure
            await this.trackEvent('failed', filename, {
                filename,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }

    /**
     * Delete file from Vercel Blob storage
     * 
     * @param options - Vercel delete options
     * @throws Error if deletion fails
     */
    async delete(options: VercelDeleteOptions): Promise<void> {
        // Validate required fields
        this.validateRequiredFields(options, ['fileUrl', 'vercelToken']);

        try {
            // Call ObitoX API to delete the file
            await this.makeRequest('/api/v1/upload/vercel/delete', {
                method: 'DELETE',
                body: JSON.stringify({
                    fileUrl: options.fileUrl,
                    provider: 'VERCEL',
                    vercelToken: options.vercelToken,
                }),
            });

            console.log(`✅ Deleted Vercel Blob: ${options.fileUrl}`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete Vercel Blob: ${errorMessage}`);
        }
    }

    /**
     * Get download URL for Vercel Blob
     * 
     * Note: Vercel Blobs are publicly accessible by default.
     * This simply returns the file URL.
     * 
     * @param options - Vercel download options
     * @returns Promise resolving to the public URL
     */
    async download(options: VercelDownloadOptions): Promise<string> {
        // Validate required fields
        this.validateRequiredFields(options, ['fileUrl']);

        // Vercel Blobs are public by default, just return the URL
        return options.fileUrl!;
    }
    // ============================================================================
    // Private Helper Methods
    // ============================================================================

    /**
     * Get signed URL from ObitoX API
     * 
     * @private
     */
    private async getSignedUrl(
        filename: string,
        contentType: string,
        options: Omit<VercelUploadOptions, 'filename' | 'contentType'>
    ): Promise<UploadResponse> {
        return this.makeRequest<UploadResponse>('/api/v1/upload/signed-url', {
            method: 'POST',
            body: JSON.stringify({
                filename,
                contentType,
                provider: 'VERCEL',
                vercelToken: options.vercelToken,
                fileSize: options.fileSize,
            }),
        });
    }

    /**
     * Upload to Vercel Blob using their SDK
     * 
     * The @vercel/blob SDK doesn't expose progress events.
     * We report 0% at start and 100% on completion for consistency.
     * 
     * @private
     */
    private async uploadToVercelBlob(
        filename: string,
        file: File | Blob,
        vercelToken: string,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        onCancel?: () => void
    ): Promise<string> {
        try {
            // Report start (0%)
            if (onProgress) {
                onProgress(0, 0, file.size);
            }

            // Upload using the Vercel Blob SDK
            const blob = await put(filename, file, {
                token: vercelToken,
                access: 'public', // Make the blob publicly accessible
            });

            // Report completion (100%)
            if (onProgress) {
                onProgress(100, file.size, file.size);
            }

            console.log(`✅ Uploaded to Vercel Blob: ${blob.url}`);

            return blob.url;

        } catch (error) {
            // Handle errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Vercel Blob upload failed: ${errorMessage}`);
        }
    }
}
