/**
 * ObitoX SDK - Main Client
 * 
 * Unified SDK for managing file uploads across multiple storage providers.
 * Supports Vercel Blob, Supabase Storage, and Uploadcare CDN.
 * 
 * @module client
 * 
 * @example
 * ```typescript
 * import ObitoX from '@obitox/sdk';
 * 
 * const client = new ObitoX({ apiKey: 'your-api-key' });
 * 
 * // Upload to Vercel
 * const url = await client.uploadFile(file, {
 *   provider: 'VERCEL',
 *   vercelToken: 'your-token'
 * });
 * ```
 */

// Import types (now from our types module)
import type { ObitoXConfig } from './types/common.js';
import type {
  UploadOptions,
  DeleteFileOptions,
  DownloadFileOptions,
  CancelUploadOptions,
  ListBucketsOptions,
} from './types/index.js';

// Import providers
import { ProviderRegistry } from './providers/base.provider.js';
import { VercelProvider } from './providers/vercel/index.js';
import { SupabaseProvider } from './providers/supabase/index.js';
import { UploadcareProvider } from './providers/uploadcare/index.js';
import { R2Provider } from './providers/r2/index.js';
import { S3Provider } from './providers/s3/index.js';

// Import types for responses
import type {
  BucketInfo,
  TrackOptions,
  AnalyticsOptions,
  AnalyticsResponse,
  ValidateApiKeyResponse,
  DownloadResponse,
} from './types/common.js';

/**
 * ObitoX SDK Client
 * 
 * Main entry point for the ObitoX SDK.
 * Provides a unified interface for uploading files to multiple storage providers.
 * 
 * @example
 * ```typescript
 * const client = new ObitoX({ apiKey: 'ox_xxx...' });
 * 
 * // Upload file
 * const fileUrl = await client.uploadFile(file, {
 *   provider: 'UPLOADCARE',
 *   uploadcarePublicKey: 'demopublickey',
 *   checkVirus: true,
 *   imageOptimization: { auto: true }
 * });
 * 
 * // Delete file
 * await client.deleteFile({
 *   fileUrl,
 *   provider: 'UPLOADCARE',
 *   uploadcarePublicKey: 'demopublickey',
 *   uploadcareSecretKey: 'demosecretkey'
 * });
 * ```
 */
export class ObitoX {
  /**
   * ObitoX API key for authentication (public key: ox_...)
   */
  private readonly apiKey: string;

  /**
   * ObitoX API secret for request signing (secret key: sk_...)
   * Required for Layer 2 security - request signatures
   */
  private readonly apiSecret?: string;

  /**
   * Base URL for ObitoX API
   */
  private readonly baseUrl: string;

  /**
   * Provider registry for managing storage providers
   */
  private readonly providers: ProviderRegistry;

  /**
   * Create a new ObitoX client
   * 
   * @param config - Configuration object
   * @param config.apiKey - Your ObitoX API key
   * @param config.baseUrl - Optional custom API base URL
   */
  constructor(config: ObitoXConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('ObitoX API key is required');
    }

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret; // Optional for now (backwards compatibility)
    this.baseUrl = config.baseUrl || 'http://localhost:5500';

    // Initialize provider registry with apiSecret for Layer 2 security
    this.providers = new ProviderRegistry(this.apiKey, this.baseUrl, this.apiSecret);

    // Register all available providers
    this.registerProviders();
  }

  /**
   * Register all storage providers
   * 
   * @private
   */
  private registerProviders(): void {
    this.providers.register('VERCEL', (apiKey, baseUrl, apiSecret) => new VercelProvider(apiKey, baseUrl, apiSecret));
    this.providers.register('SUPABASE', (apiKey, baseUrl, apiSecret) => new SupabaseProvider(apiKey, baseUrl, apiSecret));
    this.providers.register('UPLOADCARE', (apiKey, baseUrl, apiSecret) => new UploadcareProvider(apiKey, baseUrl, apiSecret));
    this.providers.register('R2', (apiKey, baseUrl, apiSecret) => new R2Provider(apiKey, baseUrl, apiSecret));
    this.providers.register('S3', (apiKey, baseUrl, apiSecret) => new S3Provider(apiKey, baseUrl, apiSecret));
  }

  // ============================================================================
  // Core Upload Methods
  // ============================================================================

  /**
   * Upload a file to a storage provider
   * 
   * This is the main upload method. It handles:
   * - Getting signed URLs from the ObitoX API
   * - Uploading directly to the storage provider (zero bandwidth cost)
   * - Progress tracking
   * - Provider-specific features (image optimization, virus scanning, etc.)
   * 
   * @param file - File or Blob to upload
   * @param options - Upload options (provider-specific)
   * @returns Promise resolving to the public file URL
   * @throws Error if provider is not supported or upload fails
   * 
   * @example
   * ```typescript
   * // Upload to Vercel Blob
   * const url = await client.uploadFile(file, {
   *   provider: 'VERCEL',
   *   vercelToken: 'vercel_blob_rw_xxx...'
   * });
   * 
   * // Upload to Uploadcare with optimization
   * const url = await client.uploadFile(file, {
   *   provider: 'UPLOADCARE',
   *   uploadcarePublicKey: 'demopublickey',
   *   uploadcareSecretKey: 'demosecretkey',
   *   checkVirus: true,
   *   imageOptimization: { auto: true }
   * });
   * ```
   */
  async uploadFile(
    file: File | Blob,
    options: Omit<UploadOptions, 'filename' | 'contentType'>
  ): Promise<string> {
    // Get the appropriate provider
    const provider = this.providers.get(options.provider);

    if (!provider) {
      throw new Error(
        `Unsupported provider: ${options.provider}. Available providers: ${this.providers.getProviderNames().join(', ')}`
      );
    }

    // Track upload initiation
    const filename = file instanceof File ? file.name : 'uploaded-file';
    await this.track({
      event: 'initiated',
      fileUrl: filename,
      filename,
      fileSize: file.size,
      provider: options.provider.toLowerCase(),
    });

    // Delegate to provider
    return provider.upload(file, options as any);
  }

  /**
   * Delete a file from a storage provider
   * 
   * @param options - Delete options (provider-specific)
   * @throws Error if provider is not supported or deletion fails
   * 
   * @example
   * ```typescript
   * await client.deleteFile({
            this.lastUploadcareUrl = `https://ucarecdn.com/${(result as any).file}/${filename}`;.jpg',
   *   provider: 'UPLOADCARE',
   *   uploadcarePublicKey: 'demopublickey',
   *   uploadcareSecretKey: 'demosecretkey'
   * });
   * ```
   */
  async deleteFile(options: DeleteFileOptions): Promise<void> {
    const provider = this.providers.get(options.provider);

    if (!provider) {
      throw new Error(`Unsupported provider: ${options.provider}`);
    }

    return provider.delete(options as any);
  }

  /**
   * Get a download URL for a file
   * 
   * For public files, this returns the public URL.
   * For private files (e.g., Supabase private buckets), this generates a signed URL.
   * 
   * @param options - Download options (provider-specific)
   * @returns Promise resolving to the download URL
   * @throws Error if provider doesn't support downloads or operation fails
   * 
   * @example
   * ```typescript
   * // Get signed URL for private Supabase file
   * const downloadUrl = await client.downloadFile({
   *   filename: 'invoice.pdf',
   *   provider: 'SUPABASE',
   *   supabaseUrl: 'https://xxx.supabase.co',
   *   supabaseToken: 'your-service-role-key',
   *   bucket: 'admin',
   *   expiresIn: 300  // 5 minutes
   * });
   * ```
   */
  async downloadFile(options: DownloadFileOptions): Promise<DownloadResponse> {
    const provider = this.providers.get(options.provider);

    if (!provider) {
      throw new Error(`Unsupported provider: ${options.provider}`);
    }

    if (!provider.download) {
      throw new Error(`Provider ${options.provider} does not support download operations`);
    }

    const downloadUrl = await provider.download(options as any);

    return {
      success: true,
      downloadUrl,
      filename: options.filename || '',
    };
  }

  /**
   * Cancel an in-progress upload
   * 
   * @param options - Cancel options
   * @throws Error if provider doesn't support cancellation or operation fails
   * 
   * @example
   * ```typescript
   * await client.cancelUpload({
   *   uploadId: 'upload-123',
   *   provider: 'VERCEL',
   *   vercelToken: 'vercel_blob_rw_xxx...'
   * });
   * ```
   */
  async cancelUpload(options: CancelUploadOptions): Promise<void> {
    const provider = this.providers.get(options.provider);

    if (!provider) {
      throw new Error(`Unsupported provider: ${options.provider}`);
    }

    if (!provider.cancel) {
      throw new Error(`Provider ${options.provider} does not support upload cancellation`);
    }

    return provider.cancel(options.uploadId);
  }

  // ============================================================================
  // Bucket Management (Supabase)
  // ============================================================================

  /**
   * List all buckets in Supabase project
   * 
   * Currently only supported for Supabase.
   * 
   * @param options - List buckets options
   * @returns Promise resolving to array of bucket information
   * @throws Error if provider doesn't support bucket listing or operation fails
   * 
   * @example
   * ```typescript
   * const buckets = await client.listBuckets({
   *   provider: 'SUPABASE',
   *   supabaseUrl: 'https://xxx.supabase.co',
   *   supabaseToken: 'your-service-role-key'
   * });
   * 
   * buckets.forEach(bucket => {
   *   console.log(`${bucket.name} - ${bucket.public ? 'Public' : 'Private'}`);
   * });
   * ```
   */
  async listBuckets(options: ListBucketsOptions): Promise<BucketInfo[]> {
    const provider = this.providers.get(options.provider);

    if (!provider) {
      throw new Error(`Unsupported provider: ${options.provider}`);
    }

    // Type guard to check if provider has listBuckets method
    if ('listBuckets' in provider && typeof provider.listBuckets === 'function') {
      return (provider as any).listBuckets(options);
    }

    throw new Error(`Provider ${options.provider} does not support bucket listing`);
  }

  // ============================================================================
  // Analytics & Tracking
  // ============================================================================

  /**
   * Track an upload event for analytics
   * 
   * This is automatically called by uploadFile, but can be used manually for custom tracking.
   * 
   * @param options - Track options
   * @returns Promise resolving when tracking is complete
   * 
   * @example
   * ```typescript
   * await client.track({
   *   event: 'completed',
   *   fileUrl: 'https://example.com/file.jpg',
   *   filename: 'photo.jpg',
   *   fileSize: 1024000,
   *   provider: 'vercel'
   * });
   * ```
   */
  async track(options: TrackOptions): Promise<void> {
    try {
      await this.makeRequest('/api/v1/upload/track', {
        method: 'POST',
        body: JSON.stringify(options),
      });
    } catch (error) {
      // Non-blocking: log error but don't throw
      console.warn('Failed to track event:', error);
    }
  }

  /**
   * Send a custom analytics event
   * 
   * @param options - Analytics options
   * @returns Promise resolving to analytics response
   * 
   * @example
   * ```typescript
   * await client.analytics({
   *   event: 'file_viewed',
   *   fileUrl: 'https://example.com/file.jpg',
   *   provider: 'vercel'
   * });
   * ```
   */
  async analytics(options: AnalyticsOptions): Promise<AnalyticsResponse> {
    return this.makeRequest('/api/v1/upload/analytics', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  // ============================================================================
  // API Key Management
  // ============================================================================

  /**
   * Validate the API key
   * 
   * Checks if the API key is valid and returns associated user information.
   * 
   * @returns Promise resolving to validation response
   * @throws Error if API key is invalid
   * 
   * @example
   * ```typescript
   * const validation = await client.validateApiKey();
   * 
   * if (validation.success) {
   *   console.log(`API key belongs to: ${validation.data.user.email}`);
   *   console.log(`Plan: ${validation.data.plan}`);
   * }
   * ```
   */
  async validateApiKey(): Promise<ValidateApiKeyResponse> {
    return this.makeRequest('/api/v1/upload/validate-key', {
      method: 'POST',
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Make HTTP request to ObitoX API
   * 
   * Internal helper method for API calls.
   * 
   * @private
   */
  private async makeRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ObitoX API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  // ============================================================================
  // R2-Specific Methods (Advanced Features)
  // ============================================================================

  /**
   * Batch upload multiple files to R2
   * 
   * R2's killer feature - generate presigned URLs for up to 100 files in a single API call.
   * This is significantly faster than calling uploadFile() 100 times.
   * 
   * @param options - R2 batch upload options
   * @returns Promise resolving to batch upload response with URLs for all files
   * @throws Error if batch upload fails or exceeds 100 files limit
   * 
   * @example
   * ```typescript
   * import type { R2BatchUploadOptions, R2BatchUploadResponse } from '@obitox/sdk';
   * 
   * const result: R2BatchUploadResponse = await client.batchUpload({
   *   files: [
   *     { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
   *     { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 },
   *     // ... up to 100 files
   *   ],
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads'
   * });
   * 
   * console.log(`Generated ${result.total} URLs in ${result.performance.totalTime}`);
   * 
   * // Upload all files in parallel
   * await Promise.all(
   *   actualFiles.map((file, i) =>
   *     fetch(result.urls[i].uploadUrl, {
   *       method: 'PUT',
   *       body: file
   *     })
   *   )
   * );
   * ```
   */
  async batchUpload(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider not available');
    }

    // Cast to R2Provider to access batchUpload method
    const r2Provider = provider as any;
    if (typeof r2Provider.batchUpload !== 'function') {
      throw new Error('R2 provider does not support batch upload');
    }

    return r2Provider.batchUpload(options);
  }

  /**
   * Batch delete multiple files from R2
   * 
   * Delete up to 1000 files in a single API call.
   * Much more efficient than calling deleteFile() 1000 times.
   * 
   * @param options - R2 batch delete options
   * @returns Promise resolving to arrays of deleted and failed file keys
   * @throws Error if batch delete fails or exceeds 1000 files limit
   * 
   * @example
   * ```typescript
   * import type { R2BatchDeleteOptions, R2BatchDeleteResponse } from '@obitox/sdk';
   * 
   * const result: R2BatchDeleteResponse = await client.batchDelete({
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
  async batchDelete(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider not available');
    }

    // Cast to R2Provider to access batchDelete method
    const r2Provider = provider as any;
    if (typeof r2Provider.batchDelete !== 'function') {
      throw new Error('R2 provider does not support batch delete');
    }

    return r2Provider.batchDelete(options);
  }

  /**
   * Generate JWT access token for R2 file or bucket
   * 
   * Creates a time-limited token with specific permissions for secure file access.
   * Use this for enterprise security scenarios where you need granular access control.
   * 
   * @param options - R2 access token options
   * @returns Promise resolving to token and metadata
   * @throws Error if token generation fails
   * 
   * @example
   * ```typescript
   * import type { R2AccessTokenOptions, R2AccessTokenResponse } from '@obitox/sdk';
   * 
   * // Generate read-only token for a specific file
   * const token: R2AccessTokenResponse = await client.generateR2AccessToken({
   *   r2Bucket: 'private-docs',
   *   fileKey: 'confidential-report.pdf',
   *   permissions: ['read'],
   *   expiresIn: 3600  // 1 hour
   * });
   * 
   * console.log('Share this token:', token.token);
   * console.log('Expires at:', token.expiresAt);
   * console.log('Usage:', token.usage.description);
   * ```
   */
  async generateR2AccessToken(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider not available');
    }

    // Cast to R2Provider to access generateAccessToken method
    const r2Provider = provider as any;
    if (typeof r2Provider.generateAccessToken !== 'function') {
      throw new Error('R2 provider does not support access tokens');
    }

    return r2Provider.generateAccessToken(options);
  }

  /**
   * Revoke R2 access token
   * 
   * Immediately invalidates a previously issued token.
   * Use this to revoke access when a token should no longer be valid.
   * 
   * @param token - JWT token to revoke
   * @throws Error if revocation fails
   * 
   * @example
   * ```typescript
   * // Revoke a previously issued token
   * await client.revokeR2AccessToken(token.token);
   * console.log('Token revoked - access denied');
   * ```
   */
  async revokeR2AccessToken(token: string): Promise<void> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider not available');
    }

    // Cast to R2Provider to access revokeAccessToken method
    const r2Provider = provider as any;
    if (typeof r2Provider.revokeAccessToken !== 'function') {
      throw new Error('R2 provider does not support token revocation');
    }

    return r2Provider.revokeAccessToken(token);
  }

  /**
   * List files in R2 bucket
   * 
   * Retrieves a list of files with pagination support.
   * Use prefix to filter by folder, and continuationToken for pagination.
   * 
   * @param options - R2 list options
   * @returns Promise resolving to file list and metadata
   * @throws Error if listing fails
   * 
   * @example
   * ```typescript
   * import type { R2ListOptions, R2ListResponse } from '@obitox/sdk';
   * 
   * // List all PDFs in "documents/" folder
   * const result: R2ListResponse = await client.listR2Files({
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
   *   console.log(`- ${file.key} (${file.size} bytes, modified: ${file.lastModified})`);
   * });
   * 
   * // Pagination for large buckets
   * if (result.truncated) {
   *   const nextPage = await client.listR2Files({
   *     ...options,
   *     continuationToken: result.continuationToken
   *   });
   * }
   * ```
   */
  async listR2Files(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider not available');
    }

    // Cast to R2Provider to access listFiles method
    const r2Provider = provider as any;
    if (typeof r2Provider.listFiles !== 'function') {
      throw new Error('R2 provider does not support file listing');
    }

    return r2Provider.listFiles(options);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get list of available providers
   * 
   * @returns Array of provider names
   * 
   * @example
   * ```typescript
   * const providers = client.getAvailableProviders();
   * console.log(`Available providers: ${providers.join(', ')}`);
   * // Output: Available providers: VERCEL, SUPABASE, UPLOADCARE, R2
   * ```
   */
  getAvailableProviders(): string[] {
    return this.providers.getProviderNames();

  }

  /**
   * Check if a provider is supported
   * 
   * @param providerName - Provider name to check
   * @returns True if provider is supported
   * 
   * @example
   * ```typescript
   * if (client.isProviderSupported('VERCEL')) {
   *   console.log('Vercel is supported!');
   * }
   * ```
   */
  isProviderSupported(providerName: string): boolean {
    return this.providers.has(providerName);
  }
}

// Export as default for convenience
export default ObitoX;

// Re-export types for easy access
export type {
  ObitoXConfig,
  UploadOptions,
  DeleteFileOptions,
  DownloadFileOptions,
  CancelUploadOptions,
  ListBucketsOptions,
  BucketInfo,
  TrackOptions,
  AnalyticsOptions,
  AnalyticsResponse,
  ValidateApiKeyResponse,
} from './types';
