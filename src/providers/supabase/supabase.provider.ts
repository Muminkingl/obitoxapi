/**
 * Supabase Storage Provider
 * 
 * Implementation of Supabase Storage for the ObitoX SDK.
 * Supports both public and private buckets with signed URL generation.
 * 
 * Features:
 * - Direct upload to Supabase Storage (zero bandwidth cost)
 * - Private bucket support with signed URLs
 * - Progress tracking simulation
 * - Upload cancellation support
 * - Bucket management operations
 * 
 * @module providers/supabase
 */

import { BaseProvider } from '../base.provider.js';
import type {
    SupabaseUploadOptions,
    SupabaseDeleteOptions,
    SupabaseDownloadOptions,
    SupabaseListBucketsOptions,
    SupabaseBucketInfo,
} from '../../types/supabase.types.js';
import type { UploadResponse, DownloadResponse } from '../../types/common.js';

/**
 * Supabase Storage Provider
 * 
 * Handles all Supabase Storage operations including buckets.
 * 
 * @example
 * ```typescript
 * const provider = new SupabaseProvider('your-api-key', 'https://api.obitox.com');
 * 
 * // Upload to public bucket
 * const publicUrl = await provider.upload(file, {
 *   filename: 'avatar.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'SUPABASE',
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseToken: 'your-service-role-key',
 *   bucket: 'avatars'
 * });
 * 
 * // Upload to private bucket with expiry
 * const privateUrl = await provider.upload(file, {
 *   filename: 'invoice.pdf',
 *   contentType: 'application/pdf',
 *   provider: 'SUPABASE',
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseToken: 'your-service-role-key',
 *   bucket: 'admin',
 *   expiresIn: 3600  // 1 hour
 * });
 * ```
 */
export class SupabaseProvider extends BaseProvider<
    SupabaseUploadOptions,
    SupabaseDeleteOptions,
    SupabaseDownloadOptions
> {
    /**
     * Current upload AbortController for cancellation support
     */
    private currentUploadController?: AbortController;

    constructor(apiKey: string, baseUrl: string, apiSecret?: string) {
        super('SUPABASE', apiKey, baseUrl, apiSecret);
    }

    /**
     * Upload file to Supabase Storage
     * 
     * Supports both public and private buckets.
     * For private buckets, automatically generates signed URLs.
     * 
     * @param file - File or Blob to upload
     * @param options - Supabase upload options
     * @returns Promise resolving to the file URL (public or signed)
     * @throws Error if upload fails or credentials are invalid
     */
    async upload(file: File | Blob, options: Omit<SupabaseUploadOptions, 'filename' | 'contentType'>): Promise<string> {
        // Validate required fields
        this.validateRequiredFields(options, ['supabaseUrl', 'supabaseToken', 'bucket']);

        // Extract filename from File object or use default
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        try {
            // Step 1: Get signed URL from ObitoX API
            const signedUrlResult = await this.getSignedUrl(filename, contentType, {
                ...options,
                fileSize: file.size,  // Always pass actual file size
            });

            if (!signedUrlResult.data.token || !signedUrlResult.data.bucket) {
                throw new Error('Missing required Supabase upload parameters: token or bucket');
            }

            // Step 2: Upload to Supabase using signed URL
            await this.uploadToSupabaseSignedUrl(
                signedUrlResult.data.uploadUrl || '',
                signedUrlResult.data.token,
                signedUrlResult.data.filename || filename,
                signedUrlResult.data.bucket,
                file,
                options.onProgress,
                options.onCancel
            );

            // Step 3: Get final URL (signed URL for private buckets)
            let finalFileUrl = signedUrlResult.data.fileUrl;

            // For private buckets with expiry, get signed download URL
            if (options.bucket === 'admin' && options.expiresIn) {
                try {
                    console.log('🔗 Getting signed URL for private Supabase file...');

                    const downloadInfo = await this.download({
                        filename: signedUrlResult.data.filename || filename,
                        provider: 'SUPABASE',
                        supabaseToken: options.supabaseToken,
                        supabaseUrl: options.supabaseUrl,
                        bucket: options.bucket,
                        expiresIn: options.expiresIn,
                    });

                    finalFileUrl = downloadInfo;
                    console.log('✅ Got signed URL with proper expiration');

                } catch (error) {
                    console.warn('⚠️  Failed to get signed URL, using original URL:', error);
                    // Continue with original URL if download fails
                }
            }

            // Step 4: Track completion
            await this.trackEvent('completed', finalFileUrl, {
                filename,
                fileSize: file.size,
                bucket: options.bucket,
            });

            return finalFileUrl;

        } catch (error) {
            // Track failure
            await this.trackEvent('failed', filename, {
                filename,
                bucket: options.bucket,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    }

    /**
     * Delete file from Supabase Storage
     * 
     * @param options - Supabase delete options
     * @throws Error if deletion fails
     */
    async delete(options: SupabaseDeleteOptions): Promise<void> {
        // Validate required fields
        this.validateRequiredFields(options, ['fileUrl', 'supabaseUrl', 'supabaseToken', 'bucket']);

        try {
            // Call ObitoX API to delete the file
            await this.makeRequest('/api/v1/upload/supabase/delete', {
                method: 'POST',  // Server uses POST for Supabase delete
                body: JSON.stringify({
                    fileUrl: options.fileUrl,
                    provider: 'SUPABASE',
                    supabaseUrl: options.supabaseUrl,
                    supabaseToken: options.supabaseToken,
                    bucket: options.bucket,
                }),
            });

            console.log(`✅ Deleted Supabase file: ${options.fileUrl}`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete Supabase file: ${errorMessage}`);
        }
    }

    /**
     * Get download URL for Supabase file
     * 
     * For public buckets: Returns the public URL
     * For private buckets: Generates a signed URL with expiration
     * 
     * @param options - Supabase download options
     * @returns Promise resolving to the download URL
     */
    async download(options: SupabaseDownloadOptions): Promise<string> {
        // For public buckets, construct URL if we have enough info
        if (!options.supabaseUrl || !options.supabaseToken) {
            if (options.fileUrl) {
                return options.fileUrl;
            }
            throw new Error('Cannot generate download URL: missing supabaseUrl and supabaseToken');
        }

        // Validate required fields for signed URL generation
        this.validateRequiredFields(options, ['supabaseUrl', 'supabaseToken', 'bucket']);

        try {
            // Call ObitoX API to get download URL
            const response = await this.makeRequest<{ success: boolean; data: { downloadUrl: string } }>('/api/v1/upload/supabase/download', {
                method: 'POST',
                body: JSON.stringify({
                    filename: options.filename,
                    fileUrl: options.fileUrl,
                    provider: 'SUPABASE',
                    supabaseUrl: options.supabaseUrl,
                    supabaseToken: options.supabaseToken,
                    bucket: options.bucket,
                    expiresIn: options.expiresIn || 3600,
                }),
            });

            return response.data.downloadUrl;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get Supabase download URL: ${errorMessage}`);
        }
    }

    /**
     * List all buckets in Supabase project
     * 
     * @param options - List buckets options
     * @returns Promise resolving to array of bucket information
     */
    async listBuckets(options: SupabaseListBucketsOptions): Promise<SupabaseBucketInfo[]> {
        // Validate required fields
        this.validateRequiredFields(options, ['supabaseUrl', 'supabaseToken']);

        try {
            const response = await this.makeRequest<{ data: { buckets: SupabaseBucketInfo[] } }>(
                '/api/v1/upload/supabase/buckets',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        provider: 'SUPABASE',
                        supabaseUrl: options.supabaseUrl,
                        supabaseToken: options.supabaseToken,
                    }),
                }
            );

            return response.data.buckets;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to list Supabase buckets: ${errorMessage}`);
        }
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
        options: Omit<SupabaseUploadOptions, 'filename' | 'contentType'>
    ): Promise<UploadResponse> {
        return this.makeRequest<UploadResponse>('/api/v1/upload/supabase/signed-url', {
            method: 'POST',
            body: JSON.stringify({
                filename,
                contentType,
                provider: 'SUPABASE',
                supabaseUrl: options.supabaseUrl,
                supabaseToken: options.supabaseToken,
                bucket: options.bucket,
                expiresIn: options.expiresIn || 3600,
                fileSize: options.fileSize,
            }),
        });
    }

    /**
     * Upload to Supabase using signed URL
     * 
     * Direct upload with progress tracking and cancellation support.
     * 
     * @private
     */
    private async uploadToSupabaseSignedUrl(
        signedUrl: string,
        token: string,
        filename: string,
        bucket: string,
        file: File | Blob,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        onCancel?: () => void
    ): Promise<void> {
        // Create AbortController for cancellation
        this.currentUploadController = new AbortController();

        // Progress tracking simulation
        if (onProgress) {
            this.simulateProgress(file.size, onProgress);
        }

        try {
            // Upload directly to Supabase signed URL
            const response = await fetch(signedUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file instanceof File ? file.type : 'application/octet-stream',
                },
                body: file,
                signal: this.currentUploadController.signal,
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }

            console.log(`✅ Uploaded to Supabase: ${bucket}/${filename}`);

        } catch (error) {
            // Handle cancellation
            if (error instanceof Error && error.name === 'AbortError') {
                if (onCancel) {
                    onCancel();
                }
                throw new Error('Upload cancelled');
            }

            // Handle other errors
            throw error;
        } finally {
            // Clean up
            this.currentUploadController = undefined;
        }
    }

    /**
     * Simulate upload progress for Node.js environments
     * 
     * @private
     */
    private simulateProgress(
        totalBytes: number,
        onProgress: (progress: number, bytesUploaded: number, totalBytes: number) => void
    ): void {
        let bytesUploaded = 0;

        const progressInterval = setInterval(() => {
            bytesUploaded += Math.ceil(totalBytes / 10); // Simulate 10% increments

            if (bytesUploaded >= totalBytes) {
                bytesUploaded = totalBytes;
                clearInterval(progressInterval);
            }

            const progress = (bytesUploaded / totalBytes) * 100;
            onProgress(progress, bytesUploaded, totalBytes);
        }, 100); // Update every 100ms

        // Clean up interval after 5 seconds
        setTimeout(() => clearInterval(progressInterval), 5000);
    }
}
