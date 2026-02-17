/**
 * Cloudflare R2 Storage Provider
 * 
 * Implementation of Cloudflare R2 storage for the ObitoX SDK.
 * R2 is S3-compatible object storage with zero egress fees and exceptional performance.
 * 
 * Why R2 is Special:
 * - Pure crypto signing (5-10ms response time)
 * - Zero egress fees (FREE bandwidth)
 * - S3-compatible API (battle-tested)
 * - Batch operations (100 files in <500ms)
 * - Enterprise security (JWT access tokens)
 * 
 * Performance Targets:
 * - Single upload: <50ms
 * - Batch 100 files: <500ms
 * - Download URL: <30ms
 * - Token generation: <20ms
 * 
 * @module providers/r2
 */

import { BaseProvider } from '../base.provider.js';
import type {
    R2UploadOptions,
    R2BatchUploadOptions,
    R2BatchDeleteOptions,
    R2DownloadOptions,
    R2AccessTokenOptions,
    R2ListOptions,
    R2UploadResponse,
    R2BatchUploadResponse,
    R2DownloadResponse,
    R2AccessTokenResponse,
    R2ListResponse,
    R2BatchDeleteResponse,
    R2CorsConfigOptions,
    R2CorsConfigResponse,
    R2CorsVerifyOptions,
    R2CorsVerifyResponse,
    R2Config,
} from '../../types/r2.types.js';
import { normalizeNetworkInfo } from '../../utils/network-detector.js';
import { validateFile, readMagicBytes } from '../../utils/file-validator.js';
import { validateR2Credentials, validateBatchSize } from './r2.utils.js';
import { WebhookConfig } from '../../types/common.js';

/**
 * R2 Provider
 * 
 * Handles all Cloudflare R2 storage operations.
 * The FASTEST provider in the ObitoX SDK!
 * 
 * @example
 * ```typescript
 * const provider = new R2Provider('your-api-key', 'https://api.obitox.com');
 * 
 * const fileUrl = await provider.upload(file, {
 *   filename: 'avatar.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'R2',
 *   r2AccessKey: 'xxx...',
 *   r2SecretKey: 'yyy...',
 *   r2AccountId: 'abc123...',
 *   r2Bucket: 'my-uploads',
 *   onProgress: (progress) => console.log(`${progress}% uploaded`)
 * });
 * ```
 */
export class R2Provider extends BaseProvider<
    R2UploadOptions,
    { fileUrl: string; r2AccessKey: string; r2SecretKey: string; r2AccountId: string; r2Bucket: string },
    R2DownloadOptions
> {
    private config: R2Config;

    constructor(apiKey: string, baseUrl: string, apiSecret?: string, config?: R2Config) {
        super('R2', apiKey, baseUrl, apiSecret);
        this.config = config || {} as R2Config;
    }

    // ============================================================================
    // CORE: Single File Upload (CRITICAL - <50ms target)
    // ============================================================================

    /**
     * Upload file to R2 storage
     * 
     * Uses presigned URLs with pure crypto signing (no external API calls).
     * Files are uploaded directly to R2 via PUT request.
     * 
     * @param file - File or Blob to upload
     * @param options - R2 upload options
     * @returns Promise resolving to the public R2 URL
     * @throws Error if upload fails or credentials are invalid
     */
    async upload(file: File | Blob, options: Omit<R2UploadOptions, 'filename' | 'contentType'>): Promise<string> {
        const startTime = Date.now();

        // Extract filename and content type from File object
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        // Merge stored config with passed options (passed options override stored config)
        const mergedOptions = {
            ...options,
            // Stored config credentials as fallbacks (from provider instance pattern)
            r2AccessKey: (options as any).r2AccessKey || this.config.accessKey,
            r2SecretKey: (options as any).r2SecretKey || this.config.secretKey,
            r2AccountId: (options as any).r2AccountId || this.config.accountId,
            r2Bucket: (options as any).r2Bucket || this.config.bucket,
            r2PublicUrl: (options as any).r2PublicUrl || this.config.publicUrl,
            filename,
            contentType
        } as R2UploadOptions;

        // Validate R2 credentials format (client-side, instant)
        const validation = validateR2Credentials(mergedOptions);
        if (!validation.valid) {
            throw new Error(`R2 Credentials Invalid: ${validation.error}`);
        }

        // Create AbortController for cancellation
        const controller = new AbortController();

        try {
            // ==================== FILE VALIDATION ====================
            if (options.validation !== null && options.validation !== undefined) {
                console.log('   🔍 Validating file...');

                // Perform client-side validation
                const validationResult = await validateFile(file, options.validation);

                if (!validationResult.valid) {
                    // Call error callback if provided
                    if (options.validation && typeof options.validation === 'object' && options.validation.onError) {
                        options.validation.onError(validationResult.errors);
                    }

                    // Throw validation error
                    throw new Error(`Validation failed: ${validationResult.errors.join('; ')}`);
                }

                console.log(`   ✅ File validation passed (${validationResult.file.sizeFormatted})`);

                // Log warnings if any
                if (validationResult.warnings.length > 0) {
                    console.log(`   ⚠️  Validation warnings: ${validationResult.warnings.join('; ')}`);
                }
            }

            // Get network info for smart expiry
            const networkInfo = normalizeNetworkInfo(options.networkInfo);

            // ==================== READ MAGIC BYTES ====================
            // Read magic bytes for server-side validation (skip for large files >100MB)
            const magicBytes = file.size <= 100 * 1024 * 1024
                ? await readMagicBytes(file)
                : null;

            // STEP 1: Get presigned URL from ObitoX API (pure crypto, 5-15ms)
            const response = await this.makeRequest<R2UploadResponse>(
                '/api/v1/upload/r2/signed-url',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filename,
                        contentType,
                        fileSize: file.size,
                        r2AccessKey: mergedOptions.r2AccessKey,
                        r2SecretKey: mergedOptions.r2SecretKey,
                        r2AccountId: mergedOptions.r2AccountId,
                        r2Bucket: mergedOptions.r2Bucket,
                        r2PublicUrl: mergedOptions.r2PublicUrl,
                        expiresIn: mergedOptions.expiresIn || 3600,
                        metadata: mergedOptions.metadata,
                        // ==================== SMART EXPIRY ====================
                        networkInfo,
                        // ==================== FILE VALIDATION ====================
                        magicBytes,
                        // ==================== WEBHOOK ====================
                        ...(mergedOptions.webhook && { webhook: mergedOptions.webhook })
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to generate R2 upload URL');
            }

            const { uploadUrl, publicUrl, performance, webhook: webhookInfo } = response;

            console.log(`✅ R2 signed URL generated in ${performance?.totalTime || 'N/A'}`);

            // STEP 2: Upload directly to R2 with progress tracking
            if (typeof XMLHttpRequest !== 'undefined') {
                // Browser: Use XHR for real progress
                await this.uploadWithXHR(uploadUrl, file, contentType, options.onProgress, controller.signal);
            } else {
                // Node.js: Use fetch with 0%→100%
                await this.uploadWithFetch(uploadUrl, file, contentType, options.onProgress, controller.signal);
            }

            const totalTime = Date.now() - startTime;
            console.log(`🚀 R2 upload completed in ${totalTime}ms`);

            // ==================== WEBHOOK CONFIRMATION ====================
            if (webhookInfo?.webhookId) {
                console.log(`🔗 Webhook configured: ${webhookInfo.webhookId}`);

                // Optionally confirm upload to trigger webhook
                if (options.webhook?.autoConfirm !== false) {
                    try {
                        await this.makeRequest('/api/v1/webhooks/confirm', {
                            method: 'POST',
                            body: JSON.stringify({ webhookId: webhookInfo.webhookId })
                        });
                        console.log(`✅ Webhook confirmed`);
                    } catch (confirmError) {
                        console.warn(`⚠️ Webhook confirmation failed:`, confirmError);
                        // Don't throw - webhook will be delivered by worker
                    }
                }
            }

            // Track analytics (non-blocking)
            this.trackEvent('completed', publicUrl, {
                filename,
                fileSize: file.size,
            }).catch(() => { });

            return publicUrl;

        } catch (error) {
            // Handle cancellation
            if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload cancelled')) {
                if (options.onCancel) {
                    options.onCancel();
                }
                throw new Error('Upload cancelled');
            }

            // Track failure
            await this.trackEvent('failed', filename, {
                filename,
                error: error instanceof Error ? error.message : String(error),
            });

            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Upload Failed: ${errorMessage}`);
        }
    }

    /**
     * Upload using XMLHttpRequest for REAL progress tracking (Browser)
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

            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const progress = (e.loaded / e.total) * 100;
                        onProgress(progress, e.loaded, e.total);
                    }
                });
            }

            if (signal) {
                signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new Error('Upload cancelled'));
                });
            }

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (onProgress) onProgress(100, file.size, file.size);
                    resolve();
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed - network error'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('Upload cancelled'));
            });

            xhr.open('PUT', signedUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.send(file);
        });
    }

    /**
     * Upload using fetch (Node.js)
     * @private
     */
    private async uploadWithFetch(
        signedUrl: string,
        file: File | Blob,
        contentType: string,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        _signal?: AbortSignal
    ): Promise<void> {
        // Report 0% progress
        if (onProgress) onProgress(0, 0, file.size);

        const response = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': contentType
            }
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }

        // Report 100% progress
        if (onProgress) onProgress(100, file.size, file.size);
    }

    // ============================================================================
    // BATCH: Upload Multiple Files (100 files in <500ms!)
    // ============================================================================

    /**
     * Batch upload multiple files to R2
     * 
     * Returns presigned URLs for up to 100 files in a single API call.
     * Supports validation presets and smart expiry per file.
     * 
     * @param options - R2 batch upload options
     * @returns Promise resolving to array of upload URLs
     * @throws Error if batch upload fails or exceeds limits
     * 
     * @example
     * ```typescript
     * const result = await provider.batchUpload({
     *   files: [
     *     { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
     *     { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 }
     *   ],
     *   r2AccessKey: 'xxx...',
     *   r2SecretKey: 'yyy...',
     *   r2AccountId: 'abc123...',
     *   r2Bucket: 'my-uploads',
     *   // ✅ NEW: Validation preset
     *   validation: 'images',
     *   // ✅ NEW: Smart expiry
     *   networkInfo: { effectiveType: '4g' }
     * });
     * 
     * // Upload all files in parallel
     * await Promise.all(
     *   actualFiles.map((file, i) =>
     *     fetch(result.urls[i].uploadUrl, { method: 'PUT', body: file })
     *   )
     * );
     * ```
     */
    async batchUpload(options: R2BatchUploadOptions): Promise<R2BatchUploadResponse> {
        const { files, validation, networkInfo, bufferMultiplier, ...passedCredentials } = options;

        // Merge stored config with passed credentials (provider instance pattern)
        const credentials = {
            r2AccessKey: (passedCredentials as any).r2AccessKey || this.config.accessKey,
            r2SecretKey: (passedCredentials as any).r2SecretKey || this.config.secretKey,
            r2AccountId: (passedCredentials as any).r2AccountId || this.config.accountId,
            r2Bucket: (passedCredentials as any).r2Bucket || this.config.bucket,
            r2PublicUrl: (passedCredentials as any).r2PublicUrl || this.config.publicUrl,
        };

        // Validate batch size
        const sizeValidation = validateBatchSize(files.length, 'upload');
        if (!sizeValidation.valid) {
            throw new Error(sizeValidation.error);
        }

        // Validate credentials
        const credValidation = validateR2Credentials({
            ...credentials,
            filename: 'batch',
            contentType: 'application/octet-stream',
            provider: 'R2'
        } as R2UploadOptions);
        if (!credValidation.valid) {
            throw new Error(`R2 Credentials Invalid: ${credValidation.error}`);
        }

        const startTime = Date.now();

        try {
            // Get signed URLs for all files in ONE API call
            const apiResponse = await this.makeRequest<any>(
                '/api/v1/upload/r2/batch/signed-urls',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        files: files.map((f) => ({
                            filename: f.filename,
                            contentType: f.contentType,
                            fileSize: f.fileSize
                        })),
                        ...credentials,
                        // ✅ NEW: Validation preset
                        ...(validation && { validation }),
                        // ✅ NEW: Smart expiry options
                        ...(networkInfo && { networkInfo }),
                        ...(bufferMultiplier && { bufferMultiplier })
                    }),
                }
            );

            const totalTime = Date.now() - startTime;
            console.log(`✅ Generated ${files.length} R2 URLs in ${totalTime}ms (${(totalTime / files.length).toFixed(1)}ms per file)`);

            // Separate successful and failed results
            const successfulUrls = (apiResponse.results || []).filter((r: any) => r.success);
            const failedUrls = (apiResponse.results || []).filter((r: any) => !r.success);

            // Transform API response to match documented structure
            const transformedResponse: R2BatchUploadResponse = {
                success: apiResponse.success,
                // Include both formats for compatibility
                summary: {
                    total: apiResponse.summary?.total || files.length,
                    successful: successfulUrls.length,
                    failed: failedUrls.length
                },
                // Flat format for easier access
                total: apiResponse.summary?.total || files.length,
                successful: successfulUrls.length,
                failed: failedUrls.length,
                results: apiResponse.results || [],
                urls: apiResponse.results || [],
                provider: 'r2',
                performance: apiResponse.performance || {
                    totalTime: `${totalTime}ms`,
                    averagePerFile: `${(totalTime / files.length).toFixed(1)}ms`
                },
                // ✅ NEW: Include errors for failed files
                errors: failedUrls.length > 0 ? failedUrls : undefined
            };

            return transformedResponse;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Batch Upload Failed: ${errorMessage}`);
        }
    }

    // ============================================================================
    // DOWNLOAD: Time-Limited Download URLs (<30ms)
    // ============================================================================

    /**
     * Get download URL for R2 file
     * 
     * Generates a presigned GET URL with configurable expiration.
     * Uses stored config credentials if not provided in options.
     * 
     * @param options - R2 download options
     * @returns Promise resolving to the download URL
     */
    async getSignedDownloadUrl(options: R2DownloadOptions): Promise<string> {
        // Use credentials from options or fall back to stored config
        const credentials = {
            r2AccessKey: (options as any).r2AccessKey || this.config.accessKey || '',
            r2SecretKey: (options as any).r2SecretKey || this.config.secretKey || '',
            r2AccountId: (options as any).r2AccountId || this.config.accountId || '',
            r2Bucket: (options as any).r2Bucket || this.config.bucket || ''
        };

        const response = await this.makeRequest<R2DownloadResponse>(
            '/api/v1/upload/r2/download-url',
            {
                method: 'POST',
                body: JSON.stringify({
                    fileKey: options.fileKey,
                    ...credentials,
                    expiresIn: options.expiresIn || 3600
                })
            }
        );

        if (!response.success) {
            throw new Error('Failed to generate R2 download URL');
        }

        return response.downloadUrl;
    }

    // ============================================================================
    // DELETE: File Deletion
    // ============================================================================

    /**
     * Delete file from R2
     * 
     * @param options - R2 delete options
     * @throws Error if deletion fails
     */
    async delete(options: { fileUrl: string; r2AccessKey?: string; r2SecretKey?: string; r2AccountId?: string; r2Bucket?: string }): Promise<void> {
        // Extract file key from URL
        const fileKey = options.fileUrl.split('/').pop()?.split('?')[0];

        if (!fileKey) {
            throw new Error('Invalid R2 file URL');
        }

        // Use credentials from options or fall back to stored config
        const credentials = {
            r2AccessKey: options.r2AccessKey || this.config.accessKey || '',
            r2SecretKey: options.r2SecretKey || this.config.secretKey || '',
            r2AccountId: options.r2AccountId || this.config.accountId || '',
            r2Bucket: options.r2Bucket || this.config.bucket || ''
        };

        const response = await this.makeRequest<{ success: boolean }>(
            '/api/v1/upload/r2/delete',
            {
                method: 'POST',
                body: JSON.stringify({
                    fileKey,
                    ...credentials
                })
            }
        );

        if (!response.success) {
            throw new Error('Failed to delete R2 file');
        }
    }

    // ============================================================================
    // CORS CONFIGURATION (Developer Experience)
    // ============================================================================

    /**
     * Configure CORS for R2 bucket
     * 
     * Sets up CORS rules to allow cross-origin uploads from web applications.
     * Essential for browser-based uploads to R2.
     * 
     * @param options - CORS configuration options
     * @returns Promise resolving to CORS configuration response
     * @throws Error if configuration fails
     * 
     * @example
     * ```typescript
     * const result = await provider.configureCors({
     *   r2AccessKey: 'xxx...',
     *   r2SecretKey: 'yyy...',
     *   r2AccountId: 'abc123...',
     *   r2Bucket: 'my-uploads',
     *   allowedOrigins: ['https://myapp.com', 'http://localhost:3000'],
     *   allowedMethods: ['PUT', 'GET', 'DELETE'],
     *   allowedHeaders: ['*'],
     *   exposeHeaders: ['ETag'],
     *   maxAgeSeconds: 3600
     * });
     * 
     * if (result.success) {
     *   console.log('CORS configured successfully!');
     * }
     * ```
     */
    async configureCors(
        options: Omit<R2CorsConfigOptions, 'provider'>
    ): Promise<R2CorsConfigResponse> {
        // Merge stored config with passed options (provider instance pattern)
        // Ensure both 'origins' and 'allowedOrigins' are passed to API for compatibility
        const mergedOptions = {
            ...options,
            r2AccessKey: (options as any).r2AccessKey || this.config.accessKey,
            r2SecretKey: (options as any).r2SecretKey || this.config.secretKey,
            r2AccountId: (options as any).r2AccountId || this.config.accountId,
            r2Bucket: (options as any).r2Bucket || this.config.bucket,
            provider: 'R2',
            // Pass both origins and allowedOrigins for API compatibility
            origins: options.origins || options.allowedOrigins,
            allowedOrigins: options.allowedOrigins || options.origins
        };

        const response = await this.makeRequest<R2CorsConfigResponse>('/api/v1/upload/r2/cors/setup', {
            method: 'POST',
            body: JSON.stringify(mergedOptions)
        });

        return response;
    }

    /**
     * Verify CORS configuration for R2 bucket
     * 
     * Checks if CORS is properly configured for the bucket.
     * Useful for debugging and validation.
     * 
     * @param options - CORS verification options
     * @returns Promise resolving to CORS verification response
     * @throws Error if verification fails
     * 
     * @example
     * ```typescript
     * const result = await provider.verifyCors({
     *   r2AccessKey: 'xxx...',
     *   r2SecretKey: 'yyy...',
     *   r2AccountId: 'abc123...',
     *   r2Bucket: 'my-uploads'
     * });
     * 
     * if (result.configured && result.isValid) {
     *   console.log('CORS is properly configured!');
     * } else {
     *   console.log('Issues found:', result.issues);
     *   console.log('Recommendation:', result.recommendation);
     * }
     * ```
     */
    async verifyCors(
        options: Partial<Omit<R2CorsVerifyOptions, 'provider'>> = {}
    ): Promise<R2CorsVerifyResponse> {
        // Merge stored config with passed options (provider instance pattern)
        const mergedOptions = {
            ...options,
            r2AccessKey: (options as any).r2AccessKey || this.config.accessKey,
            r2SecretKey: (options as any).r2SecretKey || this.config.secretKey,
            r2AccountId: (options as any).r2AccountId || this.config.accountId,
            r2Bucket: (options as any).r2Bucket || this.config.bucket,
            provider: 'R2'
        };

        const response = await this.makeRequest<R2CorsVerifyResponse>('/api/v1/upload/r2/cors/verify', {
            method: 'POST',
            body: JSON.stringify(mergedOptions)
        });

        return response;
    }

    // ============================================================================
    // Convenience Methods (for Provider Instance Pattern)
    // ============================================================================

    /**
     * List files in R2 bucket (convenience method using stored config)
     * 
     * @param options - List options (prefix, maxKeys, etc.)
     * @returns Promise resolving to list response
     */
    async listFiles(options: {
        prefix?: string;
        maxKeys?: number;
        continuationToken?: string;
        r2AccessKey?: string;
        r2SecretKey?: string;
        r2AccountId?: string;
        r2Bucket?: string;
    } = {}): Promise<R2ListResponse> {
        const mergedOptions = {
            prefix: options.prefix,
            maxKeys: options.maxKeys,
            continuationToken: options.continuationToken,
            r2AccessKey: options.r2AccessKey || this.config.accessKey || '',
            r2SecretKey: options.r2SecretKey || this.config.secretKey || '',
            r2AccountId: options.r2AccountId || this.config.accountId || '',
            r2Bucket: options.r2Bucket || this.config.bucket || ''
        };

        const response = await this.makeRequest<R2ListResponse>('/api/v1/upload/r2/list', {
            method: 'POST',
            body: JSON.stringify(mergedOptions)
        });

        // Extract data structure for easier access
        return {
            success: response.success,
            provider: response.provider,
            files: response.data?.files || [],
            count: response.data?.count || 0,
            truncated: response.data?.isTruncated || false,
            continuationToken: response.data?.nextContinuationToken || undefined,
            bucket: response.data?.bucket,
            prefix: response.data?.prefix,
            performance: response.performance
        };
    }

    /**
     * Alias for listFiles() - shorter method name
     * @param options - List options
     * @returns Promise resolving to list response
     */
    async list(options: Partial<R2ListOptions> = {}): Promise<R2ListResponse> {
        return this.listFiles(options as R2ListOptions);
    }

    /**
     * Get download URL for R2 file (convenience method using stored config)
     * 
     * @param options - Download URL options
     * @returns Promise resolving to download URL
     */
    async getDownloadUrl(options: {
        fileKey: string;
        expiresIn?: number;
        r2PublicUrl?: string;
        r2AccessKey?: string;
        r2SecretKey?: string;
        r2AccountId?: string;
        r2Bucket?: string;
    }): Promise<string> {
        const mergedOptions = {
            fileKey: options.fileKey,
            expiresIn: options.expiresIn,
            r2PublicUrl: options.r2PublicUrl,
            r2AccessKey: options.r2AccessKey || this.config.accessKey || '',
            r2SecretKey: options.r2SecretKey || this.config.secretKey || '',
            r2AccountId: options.r2AccountId || this.config.accountId || '',
            r2Bucket: options.r2Bucket || this.config.bucket || ''
        };

        const response = await this.makeRequest<R2DownloadResponse>('/api/v1/upload/r2/download-url', {
            method: 'POST',
            body: JSON.stringify(mergedOptions)
        });

        return response.downloadUrl;
    }

    // ============================================================================
    // ACCESS TOKENS: JWT Token Generation
    // ============================================================================

    /**
     * Generate JWT access token for R2
     * 
     * Creates a time-limited JWT token for direct R2 API access.
     * Useful for client-side uploads without exposing secret key.
     * 
     * @param options - Access token options
     * @returns Promise resolving to access token response
     */
    async generateAccessToken(options: R2AccessTokenOptions): Promise<R2AccessTokenResponse> {
        // Use credentials from options or fall back to stored config
        const credentials = {
            r2AccessKeyId: (options as any).r2AccessKeyId || this.config.accessKey || '',
            r2SecretAccessKey: (options as any).r2SecretAccessKey || this.config.secretKey || '',
            r2AccountId: (options as any).r2AccountId || this.config.accountId || '',
            r2Bucket: options.r2Bucket || this.config.bucket || ''
        };

        const response = await this.makeRequest<R2AccessTokenResponse>(
            '/api/v1/upload/r2/access-token',
            {
                method: 'POST',
                body: JSON.stringify({
                    ...credentials,
                    fileKey: options.fileKey,
                    permissions: options.permissions,
                    expiresIn: options.expiresIn || 3600
                })
            }
        );

        return response;
    }

    // ============================================================================
    // BATCH DELETE: Delete Multiple Files
    // ============================================================================

    /**
     * Delete multiple files from R2
     * 
     * Deletes up to 1000 files in a single batch operation.
     * 
     * @param options - Batch delete options
     * @returns Promise resolving to batch delete response
     */
    async batchDelete(options: R2BatchDeleteOptions): Promise<R2BatchDeleteResponse> {
        // Support both 'keys' and 'fileKeys' for compatibility
        const fileKeys = (options as any).keys || options.fileKeys;

        // Use credentials from options or fall back to stored config
        const credentials = {
            r2AccessKey: options.r2AccessKey || this.config.accessKey || '',
            r2SecretKey: options.r2SecretKey || this.config.secretKey || '',
            r2AccountId: options.r2AccountId || this.config.accountId || '',
            r2Bucket: options.r2Bucket || this.config.bucket || ''
        };

        const response = await this.makeRequest<R2BatchDeleteResponse>(
            '/api/v1/upload/r2/batch/delete',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    keys: fileKeys,
                    ...credentials
                })
            }
        );

        return response;
    }
}
