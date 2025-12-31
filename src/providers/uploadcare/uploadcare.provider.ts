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

    constructor(apiKey: string, baseUrl: string) {
        super('UPLOADCARE', apiKey, baseUrl);
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
        // Validate required fields
        this.validateRequiredFields(options, ['uploadcarePublicKey']);

        // Extract filename from File object or use default
        const filename = file instanceof File ? file.name : 'uploaded-file';
        const contentType = file instanceof File ? file.type : 'application/octet-stream';

        try {
            // Step 1: Get signed URL from ObitoX API
            const signedUrlResult = await this.getSignedUrl(filename, contentType, options);

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
                    uploadcarePublicKey: options.uploadcarePublicKey,
                    uploadcareSecretKey: options.uploadcareSecretKey,
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
        // Validate required fields
        this.validateRequiredFields(options, ['uploadcarePublicKey']);

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

    /**
     * Cancel an in-progress upload
     * 
     * @param uploadId - Upload ID (not used for Uploadcare, uses AbortController)
     */
    async cancel(uploadId: string): Promise<void> {
        if (this.currentUploadController) {
            this.currentUploadController.abort();
            console.log(`✅ Cancelled Uploadcare upload: ${uploadId}`);
        } else {
            console.warn(`⚠️  No active upload to cancel: ${uploadId}`);
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
     * Wait for virus scan to complete (with polling)
     * 
     * @private
     */
    private async waitForScanCompletion(
        requestId: string,
        options: { uploadcarePublicKey: string; uploadcareSecretKey?: string }
    ): Promise<boolean> {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

            const statusResult = await this.checkMalwareScanStatus({
                requestId,
                provider: 'UPLOADCARE',
                uploadcarePublicKey: options.uploadcarePublicKey,
                uploadcareSecretKey: options.uploadcareSecretKey || '',
            });

            if (statusResult.data?.isComplete) {
                return true;
            }

            attempts++;
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
    ): Promise<Response> {
        // Create AbortController for cancellation
        this.currentUploadController = new AbortController();

        // Progress tracking simulation
        if (onProgress) {
            this.simulateProgress(file.size, onProgress);
        }

        try {
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

            // Upload directly to Uploadcare
            const response = await fetch('https://upload.uploadcare.com/base/', {
                method: 'POST',
                body: uploadFormData,
                signal: this.currentUploadController.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Uploadcare upload failed: ${response.status} ${response.statusText} - ${errorText}`
                );
            }

            const result = await response.json();

            // Store the UUID for later use - construct proper CDN URL with filename
            const filename = file instanceof File ? file.name : 'uploaded-file';
            this.lastUploadcareUrl = `https://ucarecdn.com/${(result as any).file}/${filename}`;

            console.log(`✅ Uploaded to Uploadcare: ${this.lastUploadcareUrl}`);

            return response;
        } catch (error) {
            // Handle cancellation
            if (error instanceof Error && error.name === 'AbortError') {
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
