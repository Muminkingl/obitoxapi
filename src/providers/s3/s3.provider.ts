/**
 * AWS S3 Storage Provider
 * 
 * Implementation of AWS S3 storage for the ObitoX SDK.
 * S3 provides enterprise-grade object storage with 27 regions, 7 storage classes,
 * SSE-KMS encryption, CloudFront CDN, and object versioning.
 * 
 * Why S3 is Special:
 * - Enterprise-grade: 11 9's durability, 99.99% availability
 * - Global reach: 27 regions worldwide
 * - Storage tiers: 7 classes from hot to deep archive
 * - Advanced security: SSE-S3 + SSE-KMS encryption
 * - CDN integration: Native CloudFront support
 * - Versioning: Built-in object versioning
 * 
 * Performance Targets:
 * - Single upload: <50ms (presigned URL, pure crypto)
 * - Download URL: <30ms (presigned URL)
 * - Delete: 50-100ms (1 AWS API call)
 * - List: 100-300ms (1 AWS API call)
 * - Metadata: 50-100ms (1 AWS API call)
 * 
 * @module providers/s3
 */

import { BaseProvider } from '../base.provider.js';
import type {
    S3UploadOptions,
    S3MultipartUploadOptions,
    S3DeleteOptions,
    S3BatchDeleteOptions,
    S3DownloadOptions,
    S3ListOptions,
    S3MetadataOptions,
    S3UploadResponse,
    S3MultipartInitResponse,
    S3DownloadResponse,
    S3DeleteResponse,
    S3BatchDeleteResponse,
    S3ListResponse,
    S3MetadataResponse,
    S3CorsConfigOptions,
    S3CorsConfigResponse,
    S3CorsVerifyOptions,
    S3CorsVerifyResponse,
    S3Config,
    S3BatchUploadOptions,
    S3BatchUploadResponse,
} from '../../types/s3.types.js';
import { normalizeNetworkInfo } from '../../utils/network-detector.js';
import { validateFile, readMagicBytes } from '../../utils/file-validator.js';
import {
    validateS3Credentials,
    validateBatchSize,
    validateS3Region,
    validateStorageClass,
    validateEncryptionType
} from './s3.utils.js';

/**
 * S3 Provider
 * 
 * Handles all AWS S3 storage operations.
 * Enterprise-grade storage with global reach!
 * 
 * @example
 * ```typescript
 * const provider = new S3Provider('your-api-key', 'https://api.obitox.com');
 * 
 * const fileUrl = await provider.upload(file, {
 *   filename: 'document.pdf',
 *   contentType: 'application/pdf',
 *   provider: 'S3',
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'wJalr...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   s3StorageClass: 'INTELLIGENT_TIERING',
 *   s3EncryptionType: 'SSE-KMS',
 *   s3CloudFrontDomain: 'cdn.myapp.com',
 *   onProgress: (progress) => console.log(`${progress}% uploaded`)
 * });
 * ```
 */
export class S3Provider extends BaseProvider<
    S3UploadOptions,
    S3DeleteOptions,
    S3DownloadOptions
> {
    private config: S3Config;

    constructor(apiKey: string, baseUrl: string, apiSecret?: string, config?: S3Config) {
        super('S3', apiKey, baseUrl, apiSecret);
        this.config = config || {} as S3Config;
    }

    // ============================================================================
    // CORE: Single File Upload (CRITICAL - <50ms target)
    // ============================================================================

    /**
     * Upload file to S3 storage
     * 
     * Uses presigned URLs with pure crypto signing (no external API calls).
     * Files are uploaded directly to S3 via PUT request.
     * 
     * @param file - File or Blob to upload
     * @param options - S3 upload options
     * @returns Promise resolving to the public S3 URL
     * @throws Error if upload fails or credentials are invalid
     */
    async upload(file: File | Blob, options: Omit<S3UploadOptions, 'filename' | 'contentType'>): Promise<string> {
        const startTime = Date.now();

        // Extract filename and content type from File object
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        // Merge stored config with options (from provider instance pattern)
        // Use type assertion to handle the different property names between config and options
        const mergedOptions: S3UploadOptions = {
            ...options,
            // Stored config credentials as fallbacks
            s3AccessKey: options.s3AccessKey || this.config.accessKey || '',
            s3SecretKey: options.s3SecretKey || this.config.secretKey || '',
            s3Bucket: options.s3Bucket || this.config.bucket || '',
            s3Region: options.s3Region || this.config.region || 'us-east-1',
            s3Endpoint: (options as any).s3Endpoint || this.config.endpoint,  // Custom endpoint (MinIO/R2/etc.)
            s3StorageClass: (options as any).s3StorageClass || this.config.storageClass,
            s3EncryptionType: (options as any).s3EncryptionType || this.config.encryptionType || 'SSE-S3',
            s3KmsKeyId: (options as any).s3KmsKeyId || this.config.kmsKeyId,
            s3CloudFrontDomain: (options as any).s3CloudFrontDomain || this.config.cloudFrontDomain,
            filename,
            contentType,
            provider: 'S3'
        } as S3UploadOptions;

        // Validate S3 credentials format (client-side, instant)
        const validation = validateS3Credentials(mergedOptions);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        // Validate region (if provided)
        if (options.s3Region) {
            const regionValidation = validateS3Region(options.s3Region);
            if (!regionValidation.valid) {
                throw new Error(`S3 Region Invalid: ${regionValidation.error}`);
            }
        }

        // Validate storage class (if provided)
        if (options.s3StorageClass) {
            const storageValidation = validateStorageClass(options.s3StorageClass);
            if (!storageValidation.valid) {
                throw new Error(`S3 Storage Class Invalid: ${storageValidation.error}`);
            }
        }

        // Validate encryption type (if provided)
        if (options.s3EncryptionType) {
            const encryptionValidation = validateEncryptionType(options.s3EncryptionType);
            if (!encryptionValidation.valid) {
                throw new Error(`S3 Encryption Type Invalid: ${encryptionValidation.error}`);
            }
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
            const response = await this.makeRequest<S3UploadResponse>(
                '/api/v1/upload/s3/signed-url',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filename,
                        contentType,
                        fileSize: file.size,
                        s3AccessKey: mergedOptions.s3AccessKey,
                        s3SecretKey: mergedOptions.s3SecretKey,
                        s3Bucket: mergedOptions.s3Bucket,
                        s3Region: mergedOptions.s3Region || 'us-east-1',
                        s3Endpoint: (mergedOptions as any).s3Endpoint,
                        s3StorageClass: mergedOptions.s3StorageClass,
                        s3EncryptionType: mergedOptions.s3EncryptionType,
                        s3KmsKeyId: (mergedOptions as any).s3KmsKeyId,
                        s3CloudFrontDomain: (mergedOptions as any).s3CloudFrontDomain,
                        s3EnableVersioning: (mergedOptions as any).s3EnableVersioning,
                        expiresIn: mergedOptions.expiresIn || 3600,
                        metadata: (mergedOptions as any).metadata,
                        // ==================== SMART EXPIRY ====================
                        networkInfo,
                        // ==================== FILE VALIDATION ====================
                        magicBytes,
                        // ✅ Include webhook options if provided
                        ...(options.webhook && { webhook: options.webhook })
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to generate S3 upload URL');
            }

            const { uploadUrl, publicUrl, cdnUrl, performance } = response;

            console.log(`✅ S3 signed URL generated in ${performance?.totalTime || 'N/A'}`);

            // STEP 2: Upload directly to S3 with progress tracking
            if (typeof XMLHttpRequest !== 'undefined') {
                // Browser: Use XHR for real progress
                await this.uploadWithXHR(uploadUrl, file, contentType, options.onProgress, controller.signal);
            } else {
                // Node.js: Use fetch with 0%→100%
                await this.uploadWithFetch(uploadUrl, file, contentType, options.onProgress, controller.signal);
            }

            const totalTime = Date.now() - startTime;
            console.log(`🚀 S3 upload completed in ${totalTime}ms`);

            // Track analytics (non-blocking)
            this.trackEvent('completed', publicUrl, {
                filename,
                fileSize: file.size,
            }).catch(() => { });

            // Return CDN URL if available, otherwise public URL
            return cdnUrl || publicUrl;

        } catch (error) {
            // Handle cancellation
            if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload cancelled')) {
                if (options.onCancel) {
                    options.onCancel();
                }
                throw new Error('Upload cancelled');
            }

            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 upload failed after ${totalTime}ms:`, error);

            // Track failed upload
            this.trackEvent('failed', '', {
                filename,
                error: error instanceof Error ? error.message : String(error),
            }).catch(() => { });

            throw error;
        }
    }

    // ============================================================================
    // BATCH: Multiple Files Upload (R2's Killer Feature!)
    // ============================================================================

    /**
     * Batch upload multiple files with a single API call
     * 
     * R2's killer feature - generate presigned URLs for up to 100 files in a single API call.
     * This is significantly faster than calling upload() 100 times.
     * 
     * @param options - Batch upload options
     * @returns Promise resolving to batch upload response with URLs for all files
     * @throws Error if batch upload fails or exceeds 100 files limit
     * 
     * @example
     * ```typescript
     * const result = await provider.batchUpload({
     *   files: [
     *     { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
     *     { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 }
     *   ],
     *   s3AccessKey: 'AKIA...',
     *   s3SecretKey: 'wJalr...',
     *   s3Bucket: 'my-uploads',
     *   s3Region: 'us-east-1',
     *   validation: 'images',
     *   networkInfo: { effectiveType: '4g' }
     * });
     * 
     * console.log(`Generated ${result.summary.successful} URLs in ${result.performance?.totalTime}`);
     * 
     * // Upload all files in parallel
     * await Promise.all(
     *   actualFiles.map((file, i) =>
     *     fetch(result.results[i].uploadUrl, {
     *       method: 'PUT',
     *       body: file,
     *       headers: { 'Content-Type': file.type }
     *     })
     *   )
     * );
     * ```
     */
    async batchUpload(options: S3BatchUploadOptions): Promise<S3BatchUploadResponse> {
        const startTime = Date.now();

        // Merge stored config with options (Provider Instance Pattern)
        const mergedOptions: S3BatchUploadOptions = {
            ...options,
            s3AccessKey: options.s3AccessKey || this.config.accessKey || '',
            s3SecretKey: options.s3SecretKey || this.config.secretKey || '',
            s3Bucket: options.s3Bucket || this.config.bucket || '',
            s3Region: options.s3Region || this.config.region || 'us-east-1',
            s3Endpoint: (options as any).s3Endpoint || this.config.endpoint,
            s3StorageClass: options.s3StorageClass || (this.config.storageClass as any),
            s3EncryptionType: options.s3EncryptionType || (this.config.encryptionType as any),
            s3KmsKeyId: options.s3KmsKeyId || this.config.kmsKeyId,
            s3CloudFrontDomain: options.s3CloudFrontDomain || this.config.cloudFrontDomain,
        };

        // Validate batch size (max 100 files for batch upload)
        const batchValidation = validateBatchSize(mergedOptions.files, 'batch upload', 100);
        if (!batchValidation.valid) {
            throw new Error(`Batch size validation failed: ${batchValidation.error}`);
        }

        // Validate S3 credentials
        const credentialsValidation = validateS3Credentials(mergedOptions);
        if (!credentialsValidation.valid) {
            throw new Error(`S3 Credentials Invalid: ${credentialsValidation.error}`);
        }

        // Validate region (if provided)
        if (mergedOptions.s3Region) {
            const regionValidation = validateS3Region(mergedOptions.s3Region);
            if (!regionValidation.valid) {
                throw new Error(`S3 Region Invalid: ${regionValidation.error}`);
            }
        }

        // Validate storage class (if provided)
        if (mergedOptions.s3StorageClass) {
            const storageValidation = validateStorageClass(mergedOptions.s3StorageClass);
            if (!storageValidation.valid) {
                throw new Error(`S3 Storage Class Invalid: ${storageValidation.error}`);
            }
        }

        // Validate encryption type (if provided)
        if (mergedOptions.s3EncryptionType) {
            const encryptionValidation = validateEncryptionType(mergedOptions.s3EncryptionType);
            if (!encryptionValidation.valid) {
                throw new Error(`S3 Encryption Type Invalid: ${encryptionValidation.error}`);
            }
        }

        // Get network info for smart expiry
        const networkInfo = normalizeNetworkInfo(mergedOptions.networkInfo);

        try {
            // Make batch API call
            const response = await this.makeRequest<S3BatchUploadResponse>(
                '/api/v1/upload/s3/batch-signed-url',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        files: mergedOptions.files,
                        s3AccessKey: mergedOptions.s3AccessKey,
                        s3SecretKey: mergedOptions.s3SecretKey,
                        s3Bucket: mergedOptions.s3Bucket,
                        s3Region: mergedOptions.s3Region || 'us-east-1',
                        s3Endpoint: (mergedOptions as any).s3Endpoint,
                        s3StorageClass: mergedOptions.s3StorageClass,
                        s3EncryptionType: mergedOptions.s3EncryptionType,
                        s3KmsKeyId: mergedOptions.s3KmsKeyId,
                        s3CloudFrontDomain: mergedOptions.s3CloudFrontDomain,
                        expiresIn: mergedOptions.expiresIn || 3600,
                        // ==================== VALIDATION ====================
                        validation: mergedOptions.validation,
                        // ==================== SMART EXPIRY ====================
                        networkInfo,
                        bufferMultiplier: mergedOptions.bufferMultiplier
                    }),
                }
            );

            const totalTime = Date.now() - startTime;
            console.log(`✅ S3 batch: ${response.summary.successful}/${response.summary.total} URLs in ${totalTime}ms`);

            return response;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 batch failed after ${totalTime}ms:`, error);
            throw error;
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
                    reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            xhr.open('PUT', signedUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.send(file);
        });
    }

    /**
     * Upload using fetch for Node.js environments
     * @private
     */
    private async uploadWithFetch(
        signedUrl: string,
        file: File | Blob,
        contentType: string,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        signal?: AbortSignal
    ): Promise<void> {
        if (onProgress) onProgress(0, 0, file.size);

        const response = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': contentType },
            signal,
        });

        if (!response.ok) {
            throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`);
        }

        if (onProgress) onProgress(100, file.size, file.size);
    }


    // ============================================================================
    // CORE: Delete File
    // ============================================================================

    /**
     * Delete file from S3 storage
     * 
     * @param options - S3 delete options
     * @returns Promise resolving when file is deleted
     * @throws Error if delete fails or credentials are invalid
     */
    async delete(options: S3DeleteOptions): Promise<void> {
        const startTime = Date.now();

        // Merge stored config with options (Provider Instance Pattern)
        const mergedOptions: S3DeleteOptions = {
            ...options,
            s3AccessKey: options.s3AccessKey || this.config.accessKey || '',
            s3SecretKey: options.s3SecretKey || this.config.secretKey || '',
            s3Bucket: options.s3Bucket || this.config.bucket || '',
            s3Region: options.s3Region || this.config.region || 'us-east-1',
            s3Endpoint: (options as any).s3Endpoint || this.config.endpoint,
        } as S3DeleteOptions;

        // Validate S3 credentials
        const validation = validateS3Credentials(mergedOptions);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            const response = await this.makeRequest<S3DeleteResponse>(
                '/api/v1/upload/s3/delete',
                {
                    method: 'DELETE',
                    body: JSON.stringify({
                        key: mergedOptions.key,
                        s3AccessKey: mergedOptions.s3AccessKey,
                        s3SecretKey: mergedOptions.s3SecretKey,
                        s3Bucket: mergedOptions.s3Bucket,
                        s3Region: mergedOptions.s3Region || 'us-east-1',
                        s3Endpoint: (mergedOptions as any).s3Endpoint
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to delete S3 file');
            }

            const totalTime = Date.now() - startTime;
            console.log(`🗑️  S3 file deleted in ${totalTime}ms`);

            // Track analytics (non-blocking)
            this.trackEvent('deleted', mergedOptions.key, {
                bucket: mergedOptions.s3Bucket,
            }).catch(() => { });

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 delete failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    // ============================================================================
    // CORE: Download File (Presigned URL)
    // ============================================================================

    /**
     * Generate presigned download URL for S3 file
     * 
     * @param options - S3 download options
     * @returns Promise resolving to the download URL
     * @throws Error if credentials are invalid
     */
    async download(options: S3DownloadOptions): Promise<string> {
        const startTime = Date.now();

        // Merge stored config with options (Provider Instance Pattern)
        const mergedOptions: S3DownloadOptions = {
            ...options,
            s3AccessKey: options.s3AccessKey || this.config.accessKey || '',
            s3SecretKey: options.s3SecretKey || this.config.secretKey || '',
            s3Bucket: options.s3Bucket || this.config.bucket || '',
            s3Region: options.s3Region || this.config.region || 'us-east-1',
            s3Endpoint: (options as any).s3Endpoint || this.config.endpoint,
            s3CloudFrontDomain: options.s3CloudFrontDomain || this.config.cloudFrontDomain,
        } as S3DownloadOptions;

        // Validate S3 credentials
        const validation = validateS3Credentials(mergedOptions);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            const response = await this.makeRequest<S3DownloadResponse>(
                '/api/v1/upload/download/s3/signed-url',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        key: mergedOptions.key,
                        s3AccessKey: mergedOptions.s3AccessKey,
                        s3SecretKey: mergedOptions.s3SecretKey,
                        s3Bucket: mergedOptions.s3Bucket,
                        s3Region: mergedOptions.s3Region || 'us-east-1',
                        s3Endpoint: (mergedOptions as any).s3Endpoint,
                        s3CloudFrontDomain: mergedOptions.s3CloudFrontDomain,
                        expiresIn: mergedOptions.expiresIn || 3600,
                        responseContentType: mergedOptions.responseContentType,
                        responseContentDisposition: mergedOptions.responseContentDisposition
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to generate S3 download URL');
            }

            const totalTime = Date.now() - startTime;
            console.log(`📥 S3 download URL generated in ${totalTime}ms`);

            // Return CDN URL if available, otherwise download URL
            return response.cdnUrl || response.downloadUrl;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 download URL generation failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    // ============================================================================
    // ADVANCED: Multipart Upload (for files >100MB)
    // ============================================================================

    /**
     * Initiate multipart upload for large files (>100MB)
     * 
     * @param file - Large file to upload
     * @param options - S3 multipart upload options
     * @returns Promise resolving to the final file URL
     * @throws Error if upload fails
     */
    async multipartUpload(file: File | Blob, options: S3MultipartUploadOptions): Promise<string> {
        const startTime = Date.now();

        // Extract filename and content type
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        // Validate S3 credentials
        const fullOptions = { ...options, filename, contentType, provider: 'S3' as const };
        const validation = validateS3Credentials(fullOptions);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            // STEP 1: Initiate multipart upload
            const initResponse = await this.makeRequest<S3MultipartInitResponse>(
                '/api/v1/upload/s3/multipart/initiate',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filename,
                        contentType,
                        fileSize: file.size,
                        s3AccessKey: options.s3AccessKey,
                        s3SecretKey: options.s3SecretKey,
                        s3Bucket: options.s3Bucket,
                        s3Region: options.s3Region || 'us-east-1',
                        s3StorageClass: options.s3StorageClass,
                        s3EncryptionType: options.s3EncryptionType,
                        s3KmsKeyId: options.s3KmsKeyId,
                        partSize: options.partSize || 10485760 // 10MB default
                    }),
                }
            );

            if (!initResponse.success) {
                throw new Error('Failed to initiate S3 multipart upload');
            }

            const { uploadId, partUrls, key } = initResponse;

            console.log(`✅ S3 multipart upload initiated: ${partUrls.length} parts`);

            // STEP 2: Upload parts (this is simplified - real implementation would need part splitting)
            // For now, return the key - actual part upload would be handled by the client
            const totalTime = Date.now() - startTime;
            console.log(`🚀 S3 multipart upload setup completed in ${totalTime}ms`);

            // Return the S3 public URL for the key
            const region = options.s3Region || 'us-east-1';
            return `https://${options.s3Bucket}.s3.${region}.amazonaws.com/${key}`;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 multipart upload failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    // ============================================================================
    // ADVANCED: Batch Delete (up to 1000 files)
    // ============================================================================

    /**
     * Delete multiple files from S3 in a single batch operation
     * 
     * @param options - S3 batch delete options
     * @returns Promise resolving when all files are deleted
     * @throws Error if batch delete fails
     */
    async batchDelete(options: S3BatchDeleteOptions): Promise<S3BatchDeleteResponse> {
        const startTime = Date.now();

        // Merge config credentials
        const mergedOptions: S3BatchDeleteOptions = {
            ...options,
            s3AccessKey: options.s3AccessKey || this.config.accessKey || '',
            s3SecretKey: options.s3SecretKey || this.config.secretKey || '',
            s3Bucket: options.s3Bucket || this.config.bucket || '',
            s3Region: options.s3Region || this.config.region || 'us-east-1',
            s3Endpoint: (options as any).s3Endpoint || this.config.endpoint,
        } as S3BatchDeleteOptions;

        // Validate batch size
        const sizeValidation = validateBatchSize(mergedOptions.keys, 'S3 batch delete', 1000);
        if (!sizeValidation.valid) {
            throw new Error(sizeValidation.error);
        }

        // Validate S3 credentials
        const validation = validateS3Credentials(mergedOptions);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            const response = await this.makeRequest<S3BatchDeleteResponse>(
                '/api/v1/upload/s3/batch-delete',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        keys: mergedOptions.keys,
                        s3AccessKey: mergedOptions.s3AccessKey,
                        s3SecretKey: mergedOptions.s3SecretKey,
                        s3Bucket: mergedOptions.s3Bucket,
                        s3Region: mergedOptions.s3Region || 'us-east-1',
                        s3Endpoint: (mergedOptions as any).s3Endpoint
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to batch delete S3 files');
            }

            const totalTime = Date.now() - startTime;
            console.log(`🗑️  S3 batch delete: ${response.deletedCount} files in ${totalTime}ms`);

            if (response.errorCount > 0) {
                console.warn(`⚠️  ${response.errorCount} files failed to delete`);
            }

            return response;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 batch delete failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    // ============================================================================
    // ADVANCED: List Files (with pagination)
    // ============================================================================

    /**
     * List files in S3 bucket
     * 
     * @param options - S3 list options
     * @returns Promise resolving to list of files
     * @throws Error if list operation fails
     */
    async list(options: S3ListOptions): Promise<S3ListResponse> {
        const startTime = Date.now();

        // Merge config credentials
        const mergedOptions: S3ListOptions = {
            ...options,
            s3AccessKey: options.s3AccessKey || this.config.accessKey || '',
            s3SecretKey: options.s3SecretKey || this.config.secretKey || '',
            s3Bucket: options.s3Bucket || this.config.bucket || '',
            s3Region: options.s3Region || this.config.region || 'us-east-1',
            s3Endpoint: (options as any).s3Endpoint || this.config.endpoint,
        } as S3ListOptions;

        // Validate S3 credentials
        const validation = validateS3Credentials(mergedOptions);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            const response = await this.makeRequest<S3ListResponse>(
                '/api/v1/upload/s3/list',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        s3AccessKey: mergedOptions.s3AccessKey,
                        s3SecretKey: mergedOptions.s3SecretKey,
                        s3Bucket: mergedOptions.s3Bucket,
                        s3Region: mergedOptions.s3Region || 'us-east-1',
                        s3Endpoint: (mergedOptions as any).s3Endpoint,
                        prefix: mergedOptions.prefix,
                        maxKeys: mergedOptions.maxKeys || 1000,
                        continuationToken: mergedOptions.continuationToken
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to list S3 files');
            }

            const totalTime = Date.now() - startTime;
            console.log(`📋 S3 list: ${response.count} files in ${totalTime}ms`);

            return response;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 list failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    // ============================================================================
    // ADVANCED: Get File Metadata (without downloading)
    // ============================================================================

    /**
     * Get file metadata without downloading the file
     * 
     * @param options - S3 metadata options
     * @returns Promise resolving to file metadata
     * @throws Error if metadata retrieval fails
     */
    async getMetadata(options: S3MetadataOptions): Promise<S3MetadataResponse> {
        const startTime = Date.now();

        // Validate S3 credentials
        const validation = validateS3Credentials(options);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            const response = await this.makeRequest<S3MetadataResponse>(
                '/api/v1/upload/s3/metadata',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        key: options.key,
                        s3AccessKey: options.s3AccessKey,
                        s3SecretKey: options.s3SecretKey,
                        s3Bucket: options.s3Bucket,
                        s3Region: options.s3Region || 'us-east-1',
                        s3Endpoint: (options as any).s3Endpoint,
                        versionId: options.versionId
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to get S3 file metadata');
            }

            const totalTime = Date.now() - startTime;
            console.log(`📊 S3 metadata retrieved in ${totalTime}ms`);

            return response;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 metadata retrieval failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    // ============================================================================
    // CORS: Configure CORS on S3 bucket
    // ============================================================================

    /**
     * Configure CORS on an S3 bucket to allow cross-origin requests
     * 
     * This method sets up CORS rules on your S3 bucket, enabling browser-based
     * uploads from your configured origins. Uses Option A (Backend Auto-Configuration).
     *
     * @param options - S3 CORS configuration options
     * @returns Promise resolving to CORS configuration response
     * @throws Error if CORS configuration fails
     *
     * @example
     * ```typescript
     * await s3Provider.configureCors({
     *     s3AccessKey: 'AKIA...',
     *     s3SecretKey: 'xxx...',
     *     s3Bucket: 'my-uploads',
     *     s3Region: 'us-east-1',
     *     allowedOrigins: ['https://myapp.com', 'https://www.myapp.com'],
     *     allowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
     *     allowedHeaders: ['*'],
     *     maxAgeSeconds: 3600,
     *     exposeHeaders: ['ETag', 'x-amz-meta-*'],
     *     optionsSuccessStatus: 204
     * });
     * ```
     */
    async configureCors(options: S3CorsConfigOptions): Promise<S3CorsConfigResponse> {
        const startTime = Date.now();

        // Validate S3 credentials
        const validation = validateS3Credentials(options);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        // Support both 'origins' and 'allowedOrigins' for flexibility
        const finalOrigins = options.origins || options.allowedOrigins;

        try {
            const response = await this.makeRequest<S3CorsConfigResponse>(
                '/api/v1/upload/s3/cors/configure',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        s3AccessKey: options.s3AccessKey,
                        s3SecretKey: options.s3SecretKey,
                        s3Bucket: options.s3Bucket,
                        s3Region: options.s3Region || 'us-east-1',
                        s3Endpoint: (options as any).s3Endpoint,
                        // Pass both for API compatibility
                        origins: finalOrigins,
                        allowedOrigins: finalOrigins || ['*'],
                        allowedMethods: options.allowedMethods || ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                        allowedHeaders: options.allowedHeaders || ['*'],
                        maxAgeSeconds: options.maxAgeSeconds || 3600,
                        exposeHeaders: options.exposeHeaders || [],
                        optionsSuccessStatus: options.optionsSuccessStatus || 204
                    }),
                }
            );

            const totalTime = Date.now() - startTime;

            if (response.success) {
                console.log(`🌐 S3 CORS configured in ${totalTime}ms`);
            } else {
                console.warn(`⚠️  S3 CORS configuration warning: ${response.message}`);
            }

            return response;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 CORS configuration failed after ${totalTime}ms:`, error);
            throw error;
        }
    }

    /**
     * Verify CORS configuration on an S3 bucket
     *
     * Checks if CORS is properly configured on the S3 bucket and returns
     * the current CORS rules along with a validation status.
     *
     * @param options - S3 CORS verification options
     * @returns Promise resolving to CORS verification response
     * @throws Error if verification fails
     *
     * @example
     * ```typescript
     * const result = await s3Provider.verifyCors({
     *     s3AccessKey: 'AKIA...',
     *     s3SecretKey: 'xxx...',
     *     s3Bucket: 'my-uploads',
     *     s3Region: 'us-east-1'
     * });
     * 
     * if (result.isValid) {
     *     console.log('CORS is properly configured');
     *     console.log('Rules:', result.corsRules);
     * }
     * ```
     */
    async verifyCors(options: S3CorsVerifyOptions): Promise<S3CorsVerifyResponse> {
        const startTime = Date.now();

        // Validate S3 credentials
        const validation = validateS3Credentials(options);
        if (!validation.valid) {
            throw new Error(`S3 Credentials Invalid: ${validation.error}`);
        }

        try {
            const response = await this.makeRequest<S3CorsVerifyResponse>(
                '/api/v1/upload/s3/cors/verify',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        s3AccessKey: options.s3AccessKey,
                        s3SecretKey: options.s3SecretKey,
                        s3Bucket: options.s3Bucket,
                        s3Region: options.s3Region || 'us-east-1',
                        s3Endpoint: (options as any).s3Endpoint
                    }),
                }
            );

            const totalTime = Date.now() - startTime;

            if (response.success) {
                console.log(`🔍 S3 CORS verified in ${totalTime}ms`);
            } else {
                console.warn(`⚠️  S3 CORS verification warning: ${response.message}`);
            }

            return response;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ S3 CORS verification failed after ${totalTime}ms:`, error);
            throw error;
        }
    }
}
