/**
 * Base Provider Interface
 * 
 * Foundation for all storage provider implementations.
 * Every provider (Vercel, Supabase, Uploadcare, R2) must implement this interface.
 * 
 * @module providers/base
 * 
 * Architecture Benefits:
 * - Type safety: Ensures all providers have consistent methods
 * - Modularity: Each provider is self-contained
 * - Testability: Easy to mock and test individual providers
 * - Extensibility: Adding new providers is straightforward
 */

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Storage Provider Interface
 * 
 * All storage providers must implement these core methods.
 * Optional methods can be overridden as needed.
 * 
 * @template TUploadOptions - Provider-specific upload options type
 * @template TDeleteOptions - Provider-specific delete options type
 * @template TDownloadOptions - Provider-specific download options type
 */
export interface IStorageProvider<
    TUploadOptions = any,
    TDeleteOptions = any,
    TDownloadOptions = any
> {
    /**
     * Upload a file to the storage provider
     * 
     * @param file - File or Blob to upload
     * @param options - Provider-specific upload options
     * @returns Promise resolving to the public file URL
     * @throws Error if upload fails
     */
    upload(file: File | Blob, options: TUploadOptions): Promise<string>;

    /**
     * Delete a file from the storage provider
     * 
     * @param options - Provider-specific delete options
     * @returns Promise resolving when deletion is complete
     * @throws Error if deletion fails
     */
    delete(options: TDeleteOptions): Promise<void>;

    /**
     * Get a download URL for a file (optional)
     * 
     * For public files: returns the public URL
     * For private files: generates a signed URL with expiration
     * 
     * @param options - Provider-specific download options
     * @returns Promise resolving to the download URL
     * @throws Error if provider doesn't support downloads or if operation fails
     */
    download?(options: TDownloadOptions): Promise<string>;

    /**
     * Cancel an in-progress upload (optional)
     * 
     * @param uploadId - Unique identifier for the upload to cancel
     * @returns Promise resolving when cancellation is complete
     * @throws Error if provider doesn't support cancellation or if operation fails
     */
    cancel?(uploadId: string): Promise<void>;
}

// ============================================================================
// Base Provider Abstract Class
// ============================================================================

/**
 * Base Provider Implementation
 * 
 * Abstract class providing common functionality for all providers.
 * Providers should extend this class and implement required methods.
 * 
 * @abstract
 */
export abstract class BaseProvider<
    TUploadOptions = any,
    TDeleteOptions = any,
    TDownloadOptions = any
> implements IStorageProvider<TUploadOptions, TDeleteOptions, TDownloadOptions> {
    /**
     * Provider name (e.g., 'VERCEL', 'SUPABASE', 'UPLOADCARE')
     */
    protected readonly providerName: string;

    /**
     * ObitoX API key for authentication (public key: ox_...)
     */
    protected readonly apiKey: string;

    /**
     * ObitoX API secret for request signing (secret key: sk_...)
     * Required for Layer 2 security - request signatures
     */
    protected readonly apiSecret?: string;

    /**
     * Base URL for ObitoX API
     */
    protected readonly baseUrl: string;

    /**
     * Constructor
     * 
     * @param providerName - Name of the provider
     * @param apiKey - ObitoX API key (public key: ox_...)
     * @param baseUrl - ObitoX API base URL
     * @param apiSecret - Optional API secret (sk_...) for request signing
     */
    constructor(providerName: string, apiKey: string, baseUrl: string, apiSecret?: string) {
        this.providerName = providerName;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseUrl = baseUrl;
    }

    /**
     * Upload file - must be implemented by each provider
     */
    abstract upload(file: File | Blob, options: TUploadOptions): Promise<string>;

    /**
     * Delete file - must be implemented by each provider
     */
    abstract delete(options: TDeleteOptions): Promise<void>;

    /**
     * Download file - default implementation throws error
     * Override in providers that support downloads
  */
    download(options: TDownloadOptions): Promise<string> {
        throw new Error(`Download operation not supported for ${this.providerName} provider`);
    }

    /**
     * Cancel upload - default implementation throws error
     * Override in providers that support cancellation
     */
    cancel(uploadId: string): Promise<void> {
        throw new Error(`Cancel operation not supported for ${this.providerName} provider`);
    }

    /**
     * Make HTTP request to ObitoX API
     * 
     * Helper method for API calls with automatic error handling and signature generation.
     * Automatically adds Layer 2 security headers if apiSecret is provided.
     * 
     * @param endpoint - API endpoint (relative to baseUrl)
     * @param options - Fetch options
     * @returns Promise resolving to the response data
     * @throws Error if request fails
     * 
     * @protected
     */
    protected async makeRequest<T = any>(
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
                `${this.providerName} API request failed: ${response.status} ${response.statusText} - ${errorText}`
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

    /**
     * Validate required fields
     * 
     * Helper to ensure all required fields are present
     * 
     * @param options - Options object to validate
     * @param requiredFields - List of required field names
     * @throws Error if any required field is missing
     * 
     * @protected
     */
    protected validateRequiredFields(
        options: Record<string, any>,
        requiredFields: string[]
    ): void {
        const missingFields = requiredFields.filter(field => !options[field]);

        if (missingFields.length > 0) {
            throw new Error(
                `${this.providerName} provider: Missing required fields: ${missingFields.join(', ')}`
            );
        }
    }

    /**
     * Track analytics event
     * 
     * NO-OP: Analytics are already tracked server-side by updateRequestMetrics()
     * in the controller layer. This method exists for interface compatibility.
     * 
     * @param event - Event type (ignored)
     * @param fileUrl - File URL (ignored)
     * @param metadata - Additional metadata (ignored)
     * 
     * @protected
     */
    protected async trackEvent(
        _event: string,
        _fileUrl: string,
        _metadata?: Record<string, any>
    ): Promise<void> {
        // NO-OP: Server-side analytics are handled by updateRequestMetrics()
        // in controllers/providers/shared/metrics.helper.js
        // No need for a separate SDK tracking call
        return;
    }
}

// ============================================================================
// Provider Factory Type
// ============================================================================

/**
 * Provider factory function signature
 * 
 * Used for dynamically creating providers
 */
export type ProviderFactory<T extends IStorageProvider = IStorageProvider> = (
    apiKey: string,
    baseUrl: string,
    apiSecret?: string  // Layer 2: Optional API secret for signatures
) => T;

// ============================================================================
// Provider Registry
// ============================================================================

/**
 * Provider Registry
 * 
 * Maps provider names to their factory functions.
 * Used by the main ObitoX class to instantiate providers dynamically.
 */
export interface IProviderRegistry {
    /**
     * Register a provider factory
     */
    register(providerName: string, factory: ProviderFactory): void;

    /**
     * Get a provider instance
     */
    get(providerName: string): IStorageProvider | undefined;

    /**
     * Check if a provider is registered
     */
    has(providerName: string): boolean;

    /**
     * Get all registered provider names
     */
    getProviderNames(): string[];
}

/**
 * Simple Provider Registry Implementation
 */
export class ProviderRegistry implements IProviderRegistry {
    private providers: Map<string, ProviderFactory> = new Map();
    private instances: Map<string, IStorageProvider> = new Map();
    private apiKey: string;
    private apiSecret?: string;  // Layer 2: API secret for signatures
    private baseUrl: string;

    constructor(apiKey: string, baseUrl: string, apiSecret?: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseUrl = baseUrl;
    }

    register(providerName: string, factory: ProviderFactory): void {
        this.providers.set(providerName.toUpperCase(), factory);
    }

    get(providerName: string): IStorageProvider | undefined {
        const key = providerName.toUpperCase();

        // Return cached instance if exists
        if (this.instances.has(key)) {
            return this.instances.get(key);
        }

        // Create new instance with apiSecret
        const factory = this.providers.get(key);
        if (factory) {
            const instance = factory(this.apiKey, this.baseUrl, this.apiSecret);
            this.instances.set(key, instance);
            return instance;
        }

        return undefined;
    }

    has(providerName: string): boolean {
        return this.providers.has(providerName.toUpperCase());
    }

    getProviderNames(): string[] {
        return Array.from(this.providers.keys());
    }
}
