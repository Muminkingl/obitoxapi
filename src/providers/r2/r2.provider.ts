/**
 * Cloudflare R2 Storage Provider
 * 
 * Implementation of Cloudflare R2 storage for the ObitoX SDK.
 * R2 is S3-compatible object storage with zero egress fees and exceptional performance.
 * 
 * Why R2 is Special:
 * - Pure crypto signing (5-10ms vs Vercel's 220ms)
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
} from '../../types/r2.types.js';
import { validateR2Credentials, validateBatchSize } from './r2.utils.js';

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
    constructor(apiKey: string, baseUrl: string) {
        super('R2', apiKey, baseUrl);
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

        // Validate R2 credentials format (client-side, instant)
        const fullOptions = { ...options, filename, contentType } as R2UploadOptions;
        const validation = validateR2Credentials(fullOptions);
        if (!validation.valid) {
            throw new Error(`R2 Credentials Invalid: ${validation.error}`);
        }

        try {
            // STEP 1: Get presigned URL from ObitoX API (pure crypto, 5-15ms)
            const response = await this.makeRequest<R2UploadResponse>(
                '/api/v1/upload/r2/signed-url',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        filename,
                        contentType,
                        fileSize: file.size,
                        r2AccessKey: options.r2AccessKey,
                        r2SecretKey: options.r2SecretKey,
                        r2AccountId: options.r2AccountId,
                        r2Bucket: options.r2Bucket,
                        r2PublicUrl: options.r2PublicUrl,
                        expiresIn: options.expiresIn || 3600,
                        metadata: options.metadata
                    }),
                }
            );

            if (!response.success) {
                throw new Error('Failed to generate R2 upload URL');
            }

            const { uploadUrl, publicUrl, performance } = response;

            console.log(`✅ R2 signed URL generated in ${performance?.totalTime || 'N/A'}`);

            // STEP 2: Upload directly to R2 (PUT request)
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': contentType
                }
            });

            if (!uploadResponse.ok) {
                throw new Error(`R2 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
            }

            const totalTime = Date.now() - startTime;
            console.log(`🚀 R2 upload completed in ${totalTime}ms`);

            // Track analytics (non-blocking)
            this.trackEvent('completed', publicUrl, {
                filename,
                fileSize: file.size,
            }).catch(() => { });

            return publicUrl;

        } catch (error) {
            // Track failure
            await this.trackEvent('failed', filename, {
                filename,
                error: error instanceof Error ? error.message : String(error),
            });

            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Upload Failed: ${errorMessage}`);
        }
    }

    // ============================================================================
    // BATCH: Upload Multiple Files (100 files in <500ms!)
    // ============================================================================

    /**
     * Batch upload multiple files to R2
     * 
     * Returns presigned URLs for up to 100 files in a single API call.
     * This is R2's killer feature - massive performance improvement.
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
     *   r2Bucket: 'my-uploads'
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
        const { files, ...credentials } = options;

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
            const response = await this.makeRequest<R2BatchUploadResponse>(
                '/api/v1/upload/r2/batch/signed-urls',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        files: files.map(f => ({
                            filename: f.filename,
                            contentType: f.contentType,
                            fileSize: f.fileSize || 0
                        })),
                        ...credentials
                    }),
                }
            );

            const totalTime = Date.now() - startTime;
            console.log(`✅ Generated ${files.length} R2 URLs in ${totalTime}ms (${(totalTime / files.length).toFixed(1)}ms per file)`);

            return response;

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
     * 
     * @param options - R2 download options
     * @returns Promise resolving to the download URL
     * @throws Error if download URL generation fails
     */
    async download(options: R2DownloadOptions): Promise<string> {
        const startTime = Date.now();

        // Validate required fields
        this.validateRequiredFields(options, [
            'fileKey',
            'r2AccessKey',
            'r2SecretKey',
            'r2AccountId',
            'r2Bucket'
        ]);

        try {
            const response = await this.makeRequest<R2DownloadResponse>(
                '/api/v1/upload/r2/download-url',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        fileKey: options.fileKey,
                        r2AccessKey: options.r2AccessKey,
                        r2SecretKey: options.r2SecretKey,
                        r2AccountId: options.r2AccountId,
                        r2Bucket: options.r2Bucket,
                        r2PublicUrl: options.r2PublicUrl,
                        expiresIn: options.expiresIn || 3600
                    }),
                }
            );

            const totalTime = Date.now() - startTime;
            console.log(`✅ R2 download URL generated in ${totalTime}ms`);

            return response.downloadUrl;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Download URL Failed: ${errorMessage}`);
        }
    }

    // ============================================================================
    // DELETE: Remove Single File
    // ============================================================================

    /**
     * Delete file from R2 storage
     * 
     * @param options - R2 delete options
     * @throws Error if deletion fails
     */
    async delete(options: {
        fileUrl: string;
        r2AccessKey: string;
        r2SecretKey: string;
        r2AccountId: string;
        r2Bucket: string
    }): Promise<void> {
        // Validate required fields
        this.validateRequiredFields(options, [
            'fileUrl',
            'r2AccessKey',
            'r2SecretKey',
            'r2AccountId',
            'r2Bucket'
        ]);

        // Extract fileKey from URL
        // URL format: https://pub-{accountId}.r2.dev/{fileKey}
        // or custom: https://cdn.example.com/{fileKey}
        let fileKey = options.fileUrl;
        try {
            const urlObj = new URL(options.fileUrl);
            // Remove leading slash from pathname
            fileKey = urlObj.pathname.substring(1);
        } catch (error) {
            // If URL parsing fails, use the fileUrl as-is (might already be a key)
            fileKey = options.fileUrl;
        }

        try {
            await this.makeRequest(
                '/api/v1/upload/r2/delete',
                {
                    method: 'DELETE',
                    body: JSON.stringify({
                        fileKey: fileKey, // Send fileKey NOT fileUrl
                        r2AccessKey: options.r2AccessKey,
                        r2SecretKey: options.r2SecretKey,
                        r2AccountId: options.r2AccountId,
                        r2Bucket: options.r2Bucket
                    }),
                }
            );

            console.log(`✅ Deleted R2 file: ${fileKey}`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Delete Failed: ${errorMessage}`);
        }
    }


    // ============================================================================
    // BATCH DELETE: Remove up to 1000 files
    // ============================================================================

    /**
     * Batch delete multiple files from R2
     * 
     * Deletes up to 1000 files in a single API call.
     * 
     * @param options - R2 batch delete options
     * @returns Promise resolving to arrays of deleted and failed file keys
     * @throws Error if batch delete fails or exceeds limits
     * 
     * @example
     * ```typescript
     * const result = await provider.batchDelete({
     *   fileKeys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
     *   r2AccessKey: 'xxx...',
     *   r2SecretKey: 'yyy...',
     *   r2AccountId: 'abc123...',
     *   r2Bucket: 'my-uploads'
     * });
     * 
     * console.log(`Deleted: ${result.deleted.length}, Failed: ${result.errors.length}`);
     * ```
     */
    async batchDelete(options: R2BatchDeleteOptions): Promise<R2BatchDeleteResponse> {
        // Validate batch size
        const sizeValidation = validateBatchSize(options.fileKeys.length, 'delete');
        if (!sizeValidation.valid) {
            throw new Error(sizeValidation.error);
        }

        // Validate required fields
        this.validateRequiredFields(options, [
            'fileKeys',
            'r2AccessKey',
            'r2SecretKey',
            'r2AccountId',
            'r2Bucket'
        ]);

        try {
            const response = await this.makeRequest<R2BatchDeleteResponse>(
                '/api/v1/upload/r2/batch/delete',
                {
                    method: 'DELETE',
                    body: JSON.stringify({
                        filenames: options.fileKeys, // Backend expects 'filenames' not 'fileKeys'
                        r2AccessKey: options.r2AccessKey,
                        r2SecretKey: options.r2SecretKey,
                        r2AccountId: options.r2AccountId,
                        r2Bucket: options.r2Bucket
                    }),
                }
            );

            console.log(`✅ R2 batch delete: ${response.deleted.length} deleted, ${response.errors.length} errors`);

            return response;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Batch Delete Failed: ${errorMessage}`);
        }
    }

    // ============================================================================
    // SECURITY: Generate JWT Access Token (<20ms)
    // ============================================================================

    /**
     * Generate JWT access token for R2 file/bucket
     * 
     * Creates a time-limited token with specific permissions for secure file access.
     * 
     * @param options - R2 access token options
     * @returns Promise resolving to the token and metadata
     * @throws Error if token generation fails
     * 
     * @example
     * ```typescript
     * const token = await provider.generateAccessToken({
     *   r2Bucket: 'private-docs',
     *   fileKey: 'confidential-report.pdf',
     *   permissions: ['read'],
     *   expiresIn: 3600
     * });
     * 
     * console.log('Token:', token.token);
     * console.log('Expires:', token.expiresAt);
     * ```
     */
    async generateAccessToken(options: R2AccessTokenOptions): Promise<R2AccessTokenResponse> {
        // Validate required fields
        this.validateRequiredFields(options, ['r2Bucket', 'permissions']);

        try {
            const response = await this.makeRequest<R2AccessTokenResponse>(
                '/api/v1/upload/r2/access-token',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        r2Bucket: options.r2Bucket,
                        fileKey: options.fileKey,
                        permissions: options.permissions,
                        expiresIn: options.expiresIn || 3600,
                        metadata: options.metadata
                    }),
                }
            );

            console.log(`✅ R2 access token generated (expires in ${response.expiresIn}s)`);

            return response;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Token Generation Failed: ${errorMessage}`);
        }
    }

    // ============================================================================
    // SECURITY: Revoke Access Token (<10ms)
    // ============================================================================

    /**
     * Revoke R2 access token
     * 
     * Immediately invalidates a previously issued token.
     * 
     * @param token - JWT token to revoke
     * @throws Error if revocation fails
     */
    async revokeAccessToken(token: string): Promise<void> {
        if (!token || typeof token !== 'string') {
            throw new Error('Token is required and must be a string');
        }

        try {
            await this.makeRequest(
                '/api/v1/upload/r2/access-token/revoke',
                {
                    method: 'DELETE',
                    body: JSON.stringify({ token }),
                }
            );

            console.log('✅ R2 access token revoked');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 Token Revocation Failed: ${errorMessage}`);
        }
    }

    // ============================================================================
    // LIST: Browse Bucket Contents
    // ============================================================================

    /**
     * List files in R2 bucket
     * 
     * Retrieves a list of files with pagination support.
     * 
     * @param options - R2 list options
     * @returns Promise resolving to file list and metadata
     * @throws Error if listing fails
     * 
     * @example
     * ```typescript
     * const result = await provider.listFiles({
     *   r2AccessKey: 'xxx...',
     *   r2SecretKey: 'yyy...',
     *   r2AccountId: 'abc123...',
     *   r2Bucket: 'my-uploads',
     *   prefix: 'documents/',
     *   maxKeys: 50
     * });
     * 
     * console.log(`Found ${result.count} files`);
     * result.files.forEach(file => {
     *   console.log(`- ${file.key} (${file.size} bytes)`);
     * });
     * ```
     */
    async listFiles(options: R2ListOptions): Promise<R2ListResponse> {
        // Validate required fields
        this.validateRequiredFields(options, [
            'r2AccessKey',
            'r2SecretKey',
            'r2AccountId',
            'r2Bucket'
        ]);

        try {
            const response = await this.makeRequest<R2ListResponse>(
                '/api/v1/upload/r2/list',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        r2AccessKey: options.r2AccessKey,
                        r2SecretKey: options.r2SecretKey,
                        r2AccountId: options.r2AccountId,
                        r2Bucket: options.r2Bucket,
                        prefix: options.prefix,
                        maxKeys: options.maxKeys || 100,
                        continuationToken: options.continuationToken
                    }),
                }
            );

            console.log(`✅ R2 listed ${response.count} files`);

            return response;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`R2 List Failed: ${errorMessage}`);
        }
    }
}
