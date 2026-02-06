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
    SupabaseConfig,
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

    private config: SupabaseConfig;

    constructor(apiKey: string, baseUrl: string, apiSecret?: string, config?: SupabaseConfig) {
        super('SUPABASE', apiKey, baseUrl, apiSecret);
        this.config = config || {} as SupabaseConfig;
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
        // Extract filename from File object or use default
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        // Merge stored config with options (from provider instance pattern)
        const mergedOptions: SupabaseUploadOptions = {
            ...options,
            // Stored config credentials as fallbacks
            supabaseUrl: options.supabaseUrl || this.config.url || '',
            supabaseToken: options.supabaseToken || this.config.token || '',
            bucket: options.bucket || this.config.bucket || '',
            filename,
            contentType,
            provider: 'SUPABASE'
        };

        // Validate required fields
        this.validateRequiredFields(mergedOptions, ['supabaseUrl', 'supabaseToken', 'bucket']);

        try {
            // Step 1: Get signed URL from ObitoX API
            const signedUrlResult = await this.getSignedUrl(filename, contentType, {
                ...mergedOptions,
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
            const uploadedFilename = signedUrlResult.data.filename || filename;

            // If backend didn't return a public URL, it's a private bucket - get signed URL
            // (Backend returns null fileUrl for private buckets)
            if (!finalFileUrl) {
                try {
                    console.log('🔗 Getting signed URL for private Supabase file...');

                    const downloadInfo = await this.download({
                        filename: uploadedFilename,
                        provider: 'SUPABASE',
                        supabaseToken: options.supabaseToken,
                        supabaseUrl: options.supabaseUrl,
                        bucket: options.bucket,
                        expiresIn: options.expiresIn || 3600,  // Default 1 hour if not specified
                    });

                    finalFileUrl = downloadInfo;
                    console.log('✅ Got signed URL with proper expiration');

                } catch (error) {
                    console.warn('⚠️  Failed to get signed URL, constructing path:', error);
                    // Fallback: construct path-based response
                    finalFileUrl = `${options.bucket}/${uploadedFilename}`;
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
        // For public buckets, we can construct the URL with just supabaseUrl
        if (options.supabaseUrl && options.bucket && options.filename && !options.supabaseToken) {
            // Construct public URL directly (no API call needed)
            return `${options.supabaseUrl}/storage/v1/object/public/${options.bucket}/${options.filename}`;
        }

        // If we have a fileUrl, return it directly
        if (!options.supabaseUrl || !options.supabaseToken) {
            if (options.fileUrl) {
                return options.fileUrl;
            }
            throw new Error('Cannot generate download URL: missing supabaseUrl and supabaseToken (or provide fileUrl)');
        }

        // Validate required fields for signed URL generation
        this.validateRequiredFields(options, ['supabaseUrl', 'supabaseToken', 'bucket']);

        try {
            // Call ObitoX API to get download URL (for private buckets)
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
            const response = await this.makeRequest<{ data: SupabaseBucketInfo[] }>(
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

            return response.data;  // Backend returns data directly as array

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
     * Direct upload with REAL progress tracking using XHR (browser) or fetch (Node.js).
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

        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        try {
            // Use XHR for real progress in browser, fetch for Node.js
            if (typeof XMLHttpRequest !== 'undefined') {
                await this.uploadWithXHR(signedUrl, file, contentType, onProgress, this.currentUploadController.signal);
            } else {
                await this.uploadWithFetch(signedUrl, file, contentType, onProgress, this.currentUploadController.signal);
            }

            console.log(`✅ Uploaded to Supabase: ${bucket}/${filename}`);

        } catch (error) {
            // Handle cancellation
            if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload cancelled')) {
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
     * Upload using XMLHttpRequest for REAL progress tracking (Browser)
     * 
     * XHR provides real-time upload progress via upload.progress events.
     * This gives accurate bytes-uploaded information.
     * 
     * @private
     */
    private uploadWithXHR(
        signedUrl: string,
        file: File | Blob,
        contentType: string,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        signal?: AbortSignal
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Real progress tracking via XHR upload events
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const progress = (e.loaded / e.total) * 100;
                        onProgress(progress, e.loaded, e.total);
                    }
                });
            }

            // Cancel support via AbortSignal
            if (signal) {
                signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new Error('Upload cancelled'));
                });
            }

            // Success handler
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    // Final progress update
                    if (onProgress) {
                        onProgress(100, file.size, file.size);
                    }
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            });

            // Error handlers
            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            // Open and send
            xhr.open('PUT', signedUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.send(file);
        });
    }

    /**
     * Upload using fetch for Node.js environments
     * 
     * Fetch doesn't support upload progress, so we report 0% at start
     * and 100% on completion. Cancel still works via AbortSignal.
     * 
     * @private
     */
    private async uploadWithFetch(
        signedUrl: string,
        file: File | Blob,
        contentType: string,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        signal?: AbortSignal
    ): Promise<void> {
        // Report start (0%)
        if (onProgress) {
            onProgress(0, 0, file.size);
        }

        const response = await fetch(signedUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType,
            },
            body: file,
            signal,
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        // Report completion (100%)
        if (onProgress) {
            onProgress(100, file.size, file.size);
        }
    }
}

