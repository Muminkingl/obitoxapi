/**
 * Uploadcare CDN Provider
 * 
 * Implementation of Uploadcare CDN for the ObitoX SDK.
 * Features intelligent image optimization and virus scanning.
 * 
 * Features:
 * - Direct upload to Uploadcare CDN
 * - Automatic image optimization (format, quality, progressive)
 * - Virus/malware scanning
 * - Progress tracking simulation
 * - Upload cancellation support
 * 
 * @module providers/uploadcare
 */

import { BaseProvider } from '../base.provider.js';
import { buildOptimizedUploadcareUrl, isImageFile } from './uploadcare.utils.js';
import type {
    UploadcareUploadOptions,
    UploadcareDeleteOptions,
    UploadcareDownloadOptions,
    MalwareScanOptions,
    MalwareScanStatusOptions,
    MalwareScanResults,
    UploadcareConfig,
} from '../../types/uploadcare.types.js';
import type { UploadResponse, ApiResponse } from '../../types/common.js';

/**
 * Uploadcare CDN Provider
 * 
 * Handles all Uploadcare operations including uploads, optimization, and scanning.
 * 
 * @example
 * ```typescript
 * const provider = new UploadcareProvider('your-api-key', 'https://api.obitox.com');
 * 
 * const fileUrl = await provider.upload(file, {
 *   filename: 'photo.jpg',
 *   contentType: 'image/jpeg',
 *   provider: 'UPLOADCARE',
 *   uploadcarePublicKey: 'demopublickey',
 *   uploadcareSecretKey: 'demosecretkey',
 *   checkVirus: true,
 *   imageOptimization: { auto: true }
 * });
 * ```
 */
export class UploadcareProvider extends BaseProvider<
    UploadcareUploadOptions,
    UploadcareDeleteOptions,
    UploadcareDownloadOptions
> {
    /**
     * Current upload AbortController for cancellation support
     */
    private currentUploadController?: AbortController;

    /**
     * Last uploaded file URL (stored for processing)
     */
    private lastUploadcareUrl?: string;

    private config: UploadcareConfig;

    constructor(apiKey: string, baseUrl: string, apiSecret?: string, config?: UploadcareConfig) {
        super('UPLOADCARE', apiKey, baseUrl, apiSecret);
        this.config = config || {} as UploadcareConfig;
    }

    /**
     * Upload file to Uploadcare CDN
     * 
     * Supports automatic image optimization and virus scanning.
     * 
     * @param file - File or Blob to upload
     * @param options - Uploadcare upload options
     * @returns Promise resolving to the CDN URL (optimized if requested)
     * @throws Error if upload fails, virus detected, or optimization fails
     */
    async upload(
        file: File | Blob,
        options: Omit<UploadcareUploadOptions, 'filename' | 'contentType'>
    ): Promise<string> {
        // Extract filename from File object or use default
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        // Merge stored config with options (from provider instance pattern)
        const mergedOptions: UploadcareUploadOptions = {
            ...options,
            // Stored config credentials as fallbacks
            uploadcarePublicKey: options.uploadcarePublicKey || this.config.publicKey || '',
            uploadcareSecretKey: options.uploadcareSecretKey || this.config.secretKey || '',
            filename,
            contentType,
            provider: 'UPLOADCARE'
        };

        // Validate required fields
        this.validateRequiredFields(mergedOptions, ['uploadcarePublicKey']);

        try {
            // Step 1: Get signed URL from ObitoX API
            const signedUrlResult = await this.getSignedUrl(filename, contentType, mergedOptions);

            // Step 2: Upload directly to Uploadcare
            const uploadResult = await this.uploadToUploadcare(
                signedUrlResult.data.uploadUrl || '',
                file,
                signedUrlResult.data.formData || {},
                options.onProgress,
                options.onCancel
            );

            // Step 3: Get the correct CDN URL
            let finalFileUrl = this.lastUploadcareUrl || '';

            try {
                const downloadInfo = await this.download({
                    fileUrl: this.lastUploadcareUrl,
                    provider: 'UPLOADCARE',
                    uploadcarePublicKey: mergedOptions.uploadcarePublicKey,
                    uploadcareSecretKey: mergedOptions.uploadcareSecretKey,
                });

                if (downloadInfo && typeof downloadInfo === 'string') {
                    finalFileUrl = downloadInfo;
                }

                // Step 4: Apply image optimization if specified
                if (options.imageOptimization && isImageFile(filename, contentType)) {
                    try {
                        finalFileUrl = buildOptimizedUploadcareUrl(
                            finalFileUrl,
                            options.imageOptimization,
                            filename,
                            contentType
                        );
                        console.log('✅ Image optimization applied');
                    } catch (optimizationError) {
                        const errorMessage =
                            optimizationError instanceof Error
                                ? optimizationError.message
                                : String(optimizationError);
                        console.warn('⚠️  Image optimization failed, using original URL:', errorMessage);
                        // Continue with original URL if optimization fails
                    }
                }

                // Step 5: Virus scanning if enabled
                if (options.checkVirus && options.uploadcareSecretKey) {
                    await this.performVirusScan(finalFileUrl, options);
                }
            } catch (error) {
                // Fallback to basic URL if download/optimization fails
                console.warn('⚠️  Download/optimization failed, using direct CDN URL');
                finalFileUrl = this.lastUploadcareUrl || '';
            }

            // Ensure we have a valid URL
            if (!finalFileUrl) {
                throw new Error('Failed to get Uploadcare file URL');
            }

            // Step 6: Track completion
            await this.trackEvent('completed', finalFileUrl, {
                filename,
                fileSize: file.size,
            });

            return finalFileUrl;
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
     * Delete file from Uploadcare
     * 
     * @param options - Uploadcare delete options
     * @throws Error if deletion fails
     */
    async delete(options: UploadcareDeleteOptions): Promise<void> {
        // Validate required fields
        this.validateRequiredFields(options, [
            'fileUrl',
            'uploadcarePublicKey',
            'uploadcareSecretKey',
        ]);

        try {
            // Call ObitoX API to delete the file
            await this.makeRequest('/api/v1/upload/uploadcare/delete', {
                method: 'DELETE',
                body: JSON.stringify({
                    fileUrl: options.fileUrl,
                    provider: 'UPLOADCARE',
                    uploadcarePublicKey: options.uploadcarePublicKey,
                    uploadcareSecretKey: options.uploadcareSecretKey,
                }),
            });

            console.log(`✅ Deleted Uploadcare file: ${options.fileUrl}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete Uploadcare file: ${errorMessage}`);
        }
    }

    /**
     * Get download URL for Uploadcare file
     * 
     * Uploadcare files are publicly accessible via CDN by default.
     * 
     * @param options - Uploadcare download options
     * @returns Promise resolving to the CDN URL
     */
    async download(options: UploadcareDownloadOptions): Promise<string> {
        // Validate required field
        this.validateRequiredFields(options, ['fileUrl']);

        // Uploadcare CDN files are publicly accessible by default
        // Just return the fileUrl directly - no API call needed!
        if (options.fileUrl && options.fileUrl.includes('ucarecdn.com')) {
            return options.fileUrl;
        }

        // Fallback: If fileUrl doesn't look like Uploadcare URL, try API call
        try {
            const response = await this.makeRequest<{ downloadUrl: string }>(
                '/api/v1/upload/uploadcare/download',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        fileUrl: options.fileUrl,
                        provider: 'UPLOADCARE',
                        uploadcarePublicKey: options.uploadcarePublicKey,
                        uploadcareSecretKey: options.uploadcareSecretKey,
                    }),
                }
            );

            return response.downloadUrl;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get Uploadcare download URL: ${errorMessage}`);
        }
    }
    // ============================================================================
    // Virus Scanning Methods
    // ============================================================================

    /**
     * Perform complete virus scan workflow
     * 
     * Initiates scan, polls for completion, checks results, and deletes if infected.
     * 
     * @private
     */
    private async performVirusScan(
        fileUrl: string,
        options: { uploadcarePublicKey: string; uploadcareSecretKey?: string }
    ): Promise<void> {
        try {
            console.log('🦠 Scanning file for viruses...');

            // Initiate virus scan
            const scanResult = await this.scanFileForMalware({
                fileUrl,
                provider: 'UPLOADCARE',
                uploadcarePublicKey: options.uploadcarePublicKey,
                uploadcareSecretKey: options.uploadcareSecretKey || '',
            });

            // Check if scan was initiated successfully
            if (!scanResult.data?.requestId) {
                throw new Error('Failed to initiate virus scan - no request ID returned');
            }

            // Wait for scan to complete (polling)
            const isComplete = await this.waitForScanCompletion(
                scanResult.data.requestId,
                options
            );

            if (isComplete) {
                // Get scan results
                const results = await this.getMalwareScanResults({
                    fileUrl,
                    provider: 'UPLOADCARE',
                    uploadcarePublicKey: options.uploadcarePublicKey,
                    uploadcareSecretKey: options.uploadcareSecretKey || '',
                });

                if (!results.data) {
                    throw new Error('Failed to get virus scan results');
                }

                if (results.data.isInfected) {
                    console.log('🚨 VIRUS DETECTED! Deleting infected file...');
                    console.log(`🦠 Infected with: ${results.data.infectedWith}`);

                    // Delete the infected file
                    await this.delete({
                        fileUrl,
                        provider: 'UPLOADCARE',
                        uploadcarePublicKey: options.uploadcarePublicKey,
                        uploadcareSecretKey: options.uploadcareSecretKey || '',
                    });

                    throw new Error(
                        `File is infected with virus: ${results.data.infectedWith}. File has been deleted.`
                    );
                } else {
                    console.log('✅ File is clean - no viruses detected');
                }
            } else {
                console.log('⚠️  Virus scan timed out - file uploaded but scan incomplete');
            }
        } catch (virusError) {
            // If virus scanning fails, throw error to prevent using potentially infected files
            const errorMessage =
                virusError instanceof Error ? virusError.message : String(virusError);
            throw new Error(`Virus scan failed: ${errorMessage}`);
        }
    }

    /**
     * Wait for virus scan to complete (with exponential backoff polling)
     * 
     * Uses progressive delays to reduce API calls while maintaining responsiveness.
     * Interval pattern: 500ms → 1s → 2s → 3s → 5s (repeats 5s until timeout)
     * 
     * @private
     */
    private async waitForScanCompletion(
        requestId: string,
        options: { uploadcarePublicKey: string; uploadcareSecretKey?: string }
    ): Promise<boolean> {
        const intervals = [500, 1000, 2000, 3000, 5000]; // Progressive delays (ms)
        let totalWaitTime = 0;
        const maxWaitTime = 30000; // 30 seconds total timeout
        let intervalIndex = 0;

        while (totalWaitTime < maxWaitTime) {
            // Use exponential backoff intervals
            const delay = intervals[Math.min(intervalIndex, intervals.length - 1)];
            await new Promise((resolve) => setTimeout(resolve, delay));
            totalWaitTime += delay;

            const statusResult = await this.checkMalwareScanStatus({
                requestId,
                provider: 'UPLOADCARE',
                uploadcarePublicKey: options.uploadcarePublicKey,
                uploadcareSecretKey: options.uploadcareSecretKey || '',
            });

            if (statusResult.data?.isComplete) {
                console.log(`✅ Scan completed in ${totalWaitTime}ms`);
                return true;
            }

            intervalIndex++;
        }

        return false; // Timeout
    }

    /**
     * Initiate malware scan
     */
    private async scanFileForMalware(
        options: MalwareScanOptions
    ): Promise<ApiResponse<{ requestId: string }>> {
        return this.makeRequest('/api/v1/upload/uploadcare/scan-malware', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * Check malware scan status
     */
    private async checkMalwareScanStatus(
        options: MalwareScanStatusOptions
    ): Promise<ApiResponse<{ isComplete: boolean }>> {
        return this.makeRequest('/api/v1/upload/uploadcare/scan-status', {
            method: 'POST',
            body: JSON.stringify(options),
        });
    }

    /**
     * Get malware scan results
     */
    private async getMalwareScanResults(
        options: MalwareScanOptions
    ): Promise<ApiResponse<MalwareScanResults>> {
        return this.makeRequest('/api/v1/upload/uploadcare/scan-results', {
            method: 'POST',
            body: JSON.stringify(options),
        });
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
        options: Omit<UploadcareUploadOptions, 'filename' | 'contentType'>
    ): Promise<UploadResponse> {
        return this.makeRequest<UploadResponse>('/api/v1/upload/uploadcare/signed-url', {
            method: 'POST',
            body: JSON.stringify({
                filename,
                contentType,
                provider: 'UPLOADCARE',
                uploadcarePublicKey: options.uploadcarePublicKey,
                uploadcareSecretKey: options.uploadcareSecretKey,
                fileSize: options.fileSize,
            }),
        });
    }

    /**
     * Upload to Uploadcare using direct API
     * 
     * Direct upload with progress tracking and cancellation support.
     * 
     * @private
     */
    private async uploadToUploadcare(
        uploadUrl: string,
        file: File | Blob,
        formData: Record<string, string>,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        onCancel?: () => void
    ): Promise<void> {
        // Create AbortController for cancellation
        this.currentUploadController = new AbortController();

        const filename = file instanceof File ? file.name : 'uploaded-file';

        // Create FormData for Uploadcare upload
        const uploadFormData = new FormData();

        // Add all form data parameters
        Object.entries(formData).forEach(([key, value]) => {
            if (key !== 'file') {
                uploadFormData.append(key, value);
            }
        });

        // Add the file
        uploadFormData.append('file', file);

        try {
            // Use XHR for real progress in browser, fetch for Node.js
            if (typeof XMLHttpRequest !== 'undefined') {
                await this.uploadWithXHR(
                    'https://upload.uploadcare.com/base/',
                    uploadFormData,
                    file.size,
                    onProgress,
                    this.currentUploadController.signal
                );
            } else {
                await this.uploadWithFetch(
                    'https://upload.uploadcare.com/base/',
                    uploadFormData,
                    file.size,
                    onProgress,
                    this.currentUploadController.signal
                );
            }

            console.log(`✅ Uploaded to Uploadcare: ${this.lastUploadcareUrl}`);

        } catch (error) {
            // Handle cancellation
            if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Upload cancelled')) {
                if (onCancel) {
                    onCancel();
                }
                throw new Error('Upload cancelled');
            }

            // Handle other errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Uploadcare upload failed: ${errorMessage}`);
        } finally {
            // Clean up
            this.currentUploadController = undefined;
        }
    }

    /**
     * Upload using XMLHttpRequest for REAL progress tracking (Browser)
     * 
     * XHR provides real-time upload progress via upload.progress events.
     * For Uploadcare, we use POST with FormData.
     * 
     * @private
     */
    private uploadWithXHR(
        url: string,
        formData: FormData,
        totalBytes: number,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        signal?: AbortSignal
    ): Promise<Response> {
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
                        onProgress(100, totalBytes, totalBytes);
                    }

                    // Parse response and store URL
                    try {
                        const result = JSON.parse(xhr.responseText);
                        const filename = (formData.get('file') as File)?.name || 'uploaded-file';
                        this.lastUploadcareUrl = `https://ucarecdn.com/${result.file}/${filename}`;
                    } catch (e) {
                        // Continue even if parsing fails
                    }

                    resolve(new Response(xhr.responseText, { status: xhr.status }));
                } else {
                    reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            });

            // Error handlers
            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            // Open and send (no Content-Type header for FormData - browser sets it)
            xhr.open('POST', url);
            xhr.send(formData);
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
        url: string,
        formData: FormData,
        totalBytes: number,
        onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
        signal?: AbortSignal
    ): Promise<Response> {
        // Report start (0%)
        if (onProgress) {
            onProgress(0, 0, totalBytes);
        }

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Uploadcare upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        // Store the UUID for later use - construct proper CDN URL with filename
        const filename = (formData.get('file') as File)?.name || 'uploaded-file';
        this.lastUploadcareUrl = `https://ucarecdn.com/${(result as any).file}/${filename}`;

        // Report completion (100%)
        if (onProgress) {
            onProgress(100, totalBytes, totalBytes);
        }

        return response;
    }
}

