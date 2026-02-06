/**
 * ObitoX SDK - Main Client
 * 
 * Unified SDK for managing file uploads across multiple storage providers.
 * Supports S3, Cloudflare R2, Supabase Storage, and Uploadcare CDN.
 * 
 * @module client
 * 
 * @example
 * ```typescript
 * import ObitoX from '@obitox/sdk';
 * 
 * const client = new ObitoX({ apiKey: 'your-api-key' });
 * 
 * // Upload to R2
 * const url = await client.uploadFile(file, {
 *   provider: 'R2',
 *   r2AccessKey: 'your-key',
 *   r2SecretKey: 'your-secret',
 *   r2AccountId: 'your-account',
 *   r2Bucket: 'your-bucket'
 * });
 * ```
 */

// Import types (now from our types module)
import type { ObitoXConfig } from './types/common.js';
import type {
  UploadOptions,
  DeleteFileOptions,
  DownloadFileOptions,
  ListBucketsOptions,
} from './types/index.js';

// Import provider config types
import type {
  R2Config,
} from './types/r2.types.js';
import type {
  S3Config,
} from './types/s3.types.js';
import type {
  SupabaseConfig,
} from './types/supabase.types.js';
import type {
  UploadcareConfig,
} from './types/uploadcare.types.js';

// Import providers
import { ProviderRegistry } from './providers/base.provider.js';
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

// Import S3 CORS types from S3 types module
import type {
  S3CorsConfigOptions,
  S3CorsConfigResponse,
  S3CorsVerifyOptions,
  S3CorsVerifyResponse,
} from './types/s3.types.js';

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

  // ============================================================================
  // Provider Factory Methods (Provider Instance Pattern)
  // ============================================================================

  /**
   * Create an R2 provider instance with stored credentials
   * 
   * Once created, all R2 methods use these credentials automatically.
   * No need to repeat credentials for each operation.
   * 
   * @param config - R2 configuration with credentials
   * @returns R2Provider instance
   * 
   * @example
   * ```typescript
   * const client = new ObitoX({ apiKey: 'ox_xxx...' });
   * 
   * // Create R2 provider instance
   * const r2 = client.r2({
   *   accessKey: process.env.R2_ACCESS_KEY,
   *   secretKey: process.env.R2_SECRET_KEY,
   *   accountId: process.env.R2_ACCOUNT_ID,
   *   bucket: 'my-uploads'
   * });
   * 
   * // All methods use stored credentials
   * await r2.uploadFile(file);
   * await r2.configureCors({ origins: ['https://app.com'] });
   * ```
   */
  r2(config: R2Config): R2Provider {
    return new R2Provider(this.apiKey, this.baseUrl, this.apiSecret, config);
  }

  /**
   * Create an S3 provider instance with stored credentials
   * 
   * @param config - S3 configuration with credentials
   * @returns S3Provider instance
   * 
   * @example
   * ```typescript
   * const s3 = client.s3({
   *   accessKey: process.env.AWS_ACCESS_KEY,
   *   secretKey: process.env.AWS_SECRET_KEY,
   *   bucket: 'my-bucket',
   *   region: 'us-east-1'
   * });
   * 
   * await s3.uploadFile(file);
   * ```
   */
  s3(config: S3Config): S3Provider {
    return new S3Provider(this.apiKey, this.baseUrl, this.apiSecret, config);
  }

  /**
   * Create a Supabase provider instance with stored credentials
   * 
   * @param config - Supabase configuration with credentials
   * @returns SupabaseProvider instance
   * 
   * @example
   * ```typescript
   * const supabase = client.supabase({
   *   url: process.env.SUPABASE_URL,
   *   token: process.env.SUPABASE_TOKEN,
   *   bucket: 'my-bucket'
   * });
   * 
   * await supabase.uploadFile(file);
   * ```
   */
  supabase(config: SupabaseConfig): SupabaseProvider {
    return new SupabaseProvider(this.apiKey, this.baseUrl, this.apiSecret, config);
  }

  /**
   * Create an Uploadcare provider instance with stored credentials
   * 
   * @param config - Uploadcare configuration with credentials
   * @returns UploadcareProvider instance
   * 
   * @example
   * ```typescript
   * const uploadcare = client.uploadcare({
   *   publicKey: 'demopublickey',
   *   secretKey: 'demosecretkey'
   * });
   * 
   * await uploadcare.uploadFile(file);
   * ```
   */
  uploadcare(config: UploadcareConfig): UploadcareProvider {
    return new UploadcareProvider(this.apiKey, this.baseUrl, this.apiSecret, config);
  }

  /**
   * Register all storage providers
   * 
   * @private
   */
  private registerProviders(): void {
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
   * // Upload to R2 storage
   * const url = await client.uploadFile(file, {
   *   provider: 'R2',
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads'
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
   *   fileUrl,
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
  async downloadFile(options: DownloadFileOptions): Promise<string> {
    const provider = this.providers.get(options.provider);

    if (!provider) {
      throw new Error(`Unsupported provider: ${options.provider}`);
    }

    if (!provider.download) {
      throw new Error(`Provider ${options.provider} does not support download operations`);
    }

    // Return URL string directly as documented
    const downloadUrl = await provider.download(options as any);
    return downloadUrl;
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
   * NO-OP: Analytics are already tracked server-side by updateRequestMetrics()
   * in the controller layer when signed URLs are generated.
   * This method exists for interface compatibility.
   * 
   * @param options - Track options (ignored)
   * @returns Promise resolving immediately
   * 
   * @example
   * ```typescript
   * // Tracking is automatic - no need to call manually
   * await client.uploadFile(file, options);
   * // Analytics are already recorded when the signed URL was generated
   * ```
   */
  async track(_options: TrackOptions): Promise<void> {
    // NO-OP: Server-side analytics are handled by updateRequestMetrics()
    // in controllers/providers/shared/metrics.helper.js
    return;
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
   *   provider: 'r2'
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
   * Internal helper method for API calls with Layer 2 security support.
   * 
   * @private
   */
  private async makeRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const timestamp = Date.now();

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      ...(options.headers as Record<string, string> || {}),
    };

    // Layer 2: Add signature headers if apiSecret is provided
    if (this.apiSecret) {
      const method = options.method || 'GET';
      const body = options.body;

      // Generate signature (async for ESM compatibility)
      const signature = await this.generateSignature(method, endpoint, timestamp, body);

      headers['X-API-Secret'] = this.apiSecret;
      headers['X-Signature'] = signature;
      headers['X-Timestamp'] = timestamp.toString();
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ObitoX API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Generate HMAC-SHA256 signature for request (Layer 2 Security)
   * 
   * @param method - HTTP method
   * @param path - Request path
   * @param timestamp - Unix timestamp
   * @param body - Request body
   * @returns HMAC-SHA256 signature (hex)
   * 
   * @private
   */
  private async generateSignature(method: string, path: string, timestamp: number, body: any): Promise<string> {
    // Dynamic import for Node.js crypto (ESM compatible)
    const { createHmac } = await import('crypto');

    // Normalize body
    const bodyString = typeof body === 'string'
      ? body
      : body
        ? JSON.stringify(body)
        : '';

    // Create message: METHOD|PATH|TIMESTAMP|BODY
    const message = `${method.toUpperCase()}|${path}|${timestamp}|${bodyString}`;

    // Generate HMAC-SHA256
    const hmac = createHmac('sha256', this.apiSecret!);
    hmac.update(message);
    return hmac.digest('hex');
  }

  // ============================================================================
  // R2-Specific Methods (Advanced Features)
  // ============================================================================

  /**
   * Batch upload multiple files to R2
   * 
   * @deprecated Use `client.r2({ config }).uploadFiles(files)` instead
   *        Example: client.r2({ accessKey, secretKey, accountId, bucket }).uploadFiles(files)
   * @param options - R2 batch upload options
   * @returns Promise resolving to batch upload response with URLs for all files
   * @throws Error if batch upload fails or exceeds 100 files limit
   * 
   * @example
   * ```typescript
   * // NEW API (recommended):
   * const r2 = client.r2({ accessKey, secretKey, accountId, bucket });
   * await r2.uploadFiles(files);
   *
   * // OLD API (deprecated):
   * const result = await client.batchUploadR2({
   *   files: [
   *     { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
   *     // ... up to 100 files
   *   ],
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads'
   * });
   * ```
   */
  async batchUploadR2(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).batchUpload(options);
  }

  /**
   * Generate R2 access token for direct uploads
   * 
   * Generates a JWT access token for direct uploads to R2.
   * This is an alternative to presigned URLs for direct browser uploads.
   * 
   * @param options - R2 access token options
   * @returns Promise resolving to access token response
   * @throws Error if token generation fails
   * 
   * @example
   * ```typescript
   * const tokenResponse = await client.generateR2AccessToken({
   *   r2AccessKeyId: 'xxx...',
   *   r2SecretAccessKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads',
   *   r2ObjectKey: 'avatar.jpg',
   *   expiresIn: 3600  // 1 hour
   * });
   * 
   * // Use the token for direct upload
   * const formData = new FormData();
   * formData.append('file', file);
   * 
   * await fetch(`https://${tokenResponse.uploadHost}/my-uploads/avatar.jpg`, {
   *   method: 'PUT',
   *   headers: {
   *     'Authorization': `Bearer ${tokenResponse.token}`,
   *     'Content-Type': 'image/jpeg'
   *   },
   *   body: formData
   * });
   * ```
   */
  async generateR2AccessToken(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).generateAccessToken(options);
  }

  /**
   * List files in an R2 bucket
   * 
   * Lists files in a specific R2 bucket with optional prefix filtering.
   * 
   * @param options - R2 list options
   * @returns Promise resolving to list response
   * @throws Error if list fails
   * 
   * @example
   * ```typescript
   * const result = await client.listR2Files({
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads',
   *   prefix: 'images/'
   * });
   * 
   * result.files.forEach(file => {
   *   console.log(`${file.key} (${file.size} bytes)`);
   * });
   * ```
   */
  async listR2Files(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).listFiles(options);
  }

  /**
   * Delete multiple files from R2
   * 
   * Deletes multiple files from an R2 bucket in a single request.
   * 
   * @param options - R2 batch delete options
   * @returns Promise resolving to batch delete response
   * @throws Error if batch delete fails
   * 
   * @example
   * ```typescript
   * const result = await client.batchDeleteR2({
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads',
   *   keys: ['old-photo1.jpg', 'old-photo2.jpg']
   * });
   * 
   * console.log(`Deleted ${result.deleted.length} files`);
   * if (result.failed.length > 0) {
   *   console.error('Failed to delete:', result.failed);
   * }
   * ```
   */
  async batchDeleteR2(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).batchDelete(options);
  }

  /**
   * Get a presigned download URL for an R2 file
   * 
   * Generates a presigned URL for downloading a file from R2.
   * 
   * @param options - R2 download options
   * @returns Promise resolving to download URL
   * @throws Error if URL generation fails
   * 
   * @example
   * ```typescript
   * const downloadUrl = await client.getR2DownloadUrl({
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads',
   *   key: 'photo.jpg',
   *   expiresIn: 300  // 5 minutes
   * });
   * 
   * console.log('Download URL:', downloadUrl);
   * ```
   */
  async getR2DownloadUrl(options: any): Promise<string> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).getDownloadUrl(options);
  }

  /**
   * Get file metadata from R2
   * 
   * Retrieves metadata for a specific file in an R2 bucket.
   * 
   * @param options - R2 metadata options
   * @returns Promise resolving to file metadata
   * @throws Error if metadata retrieval fails
   * 
   * @example
   * ```typescript
   * const metadata = await client.getR2Metadata({
   *   r2AccessKey: 'xxx...',
   *   r2SecretKey: 'yyy...',
   *   r2AccountId: 'abc123...',
   *   r2Bucket: 'my-uploads',
   *   key: 'avatar.jpg'
   * });
   * 
   * console.log(`Size: ${metadata.size} bytes`);
   * console.log(`Content-Type: ${metadata.contentType}`);
   * console.log(`ETag: ${metadata.etag}`);
   * ```
   */
  async getR2Metadata(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).getMetadata(options);
  }

  // ============================================================================
  // R2 CORS Configuration (Developer Experience)
  // ============================================================================

  /**
   * Configure CORS for R2 bucket
   * 
   * Sets up CORS rules to allow cross-origin uploads from web applications.
   * Essential for browser-based uploads to R2.
   * 
   * @deprecated Use `client.r2({ config }).configureCors(options)` instead
   *        Example: client.r2({ accessKey, secretKey, accountId, bucket }).configureCors({ origins })
   * @param options - R2 CORS configuration options
   * @returns Promise resolving to CORS configuration response
   * @throws Error if configuration fails
   * 
   * @example
   * ```typescript
   * // NEW API (recommended):
   * const r2 = client.r2({ accessKey, secretKey, accountId, bucket });
   * await r2.configureCors({ origins: ['https://app.com'] });
   *
   * // OLD API (deprecated):
   * const result = await client.configureR2Cors({
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
  async configureR2Cors(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).configureCors(options);
  }

  /**
   * Verify CORS configuration for R2 bucket
   * 
   * Checks if CORS is properly configured for the bucket.
   * Useful for debugging and validation.
   * 
   * @deprecated Use `client.r2({ config }).verifyCors()` instead
   *        Example: client.r2({ accessKey, secretKey, accountId, bucket }).verifyCors()
   * @param options - R2 CORS verification options
   * @returns Promise resolving to CORS verification response
   * @throws Error if verification fails
   * 
   * @example
   * ```typescript
   * // NEW API (recommended):
   * const r2 = client.r2({ accessKey, secretKey, accountId, bucket });
   * const result = await r2.verifyCors();
   *
   * // OLD API (deprecated):
   * const result = await client.verifyR2Cors({
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
  async verifyR2Cors(options: any): Promise<any> {
    const provider = this.providers.get('R2');
    if (!provider) {
      throw new Error('R2 provider is not available');
    }
    return (provider as any).verifyCors(options);
  }

  // ============================================================================
  // S3-Specific Methods (Advanced Features)
  // ============================================================================

  /**
   * Configure CORS on an S3 bucket
   * 
   * Sets up Cross-Origin Resource Sharing (CORS) configuration on your S3 bucket
   * to allow cross-origin requests from your web applications.
   * 
   * @param options - S3 CORS configuration options
   * @returns Promise resolving to CORS configuration response
   * @throws Error if CORS configuration fails
   * 
   * @example
   * ```typescript
   * await client.configureS3Cors({
   *     s3AccessKey: 'xxx...',
   *     s3SecretKey: 'yyy...',
   *     s3Bucket: 'my-bucket',
   *     s3Region: 'us-east-1',
   *     allowedOrigins: ['https://myapp.com']
   * });
   * ```
   */
  async configureS3Cors(options: S3CorsConfigOptions): Promise<S3CorsConfigResponse> {
    const provider = this.providers.get('S3');
    if (!provider) {
      throw new Error('S3 provider is not available');
    }
    return (provider as S3Provider).configureCors(options);
  }

  /**
   * Verify CORS configuration on an S3 bucket
   * 
   * Checks if CORS is properly configured on the S3 bucket.
   * 
   * @param options - S3 CORS verification options
   * @returns Promise resolving to CORS verification response
   * @throws Error if verification fails
   * 
   * @example
   * ```typescript
   * const result = await client.verifyS3Cors({
   *     s3AccessKey: 'xxx...',
   *     s3SecretKey: 'yyy...',
   *     s3Bucket: 'my-bucket',
   *     s3Region: 'us-east-1'
   * });
   * 
   * if (result.isValid) {
   *     console.log('CORS is properly configured');
   * }
   * ```
   */
  async verifyS3Cors(options: S3CorsVerifyOptions): Promise<S3CorsVerifyResponse> {
    const provider = this.providers.get('S3');
    if (!provider) {
      throw new Error('S3 provider is not available');
    }
    return (provider as S3Provider).verifyCors(options);
  }
}

// Export as default for convenience
export default ObitoX;
