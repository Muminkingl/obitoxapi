export interface ObitoXConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface UploadOptions {
  filename: string;
  contentType?: string;
  provider: 'VERCEL' | 'AWS' | 'CLOUDINARY';
  token: string;
}

export interface UploadResponse {
  success: boolean;
  uploadUrl: string;
  fileUrl: string;
  filename: string;
  method: string;
  headers: Record<string, string>;
}

export interface AnalyticsOptions {
  event: string;
  fileUrl: string;
  filename?: string;
  fileSize?: number;
  provider?: string;
}

export interface AnalyticsResponse {
  success: boolean;
  message: string;
}

export interface ValidateApiKeyResponse {
  success: boolean;
  message: string;
  data?: {
    api_key: {
      id: string;
      name: string;
      status: string;
      created_at: string;
      last_used_at: string;
    };
    user: {
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
    };
    plan: string;
    profile?: any;
  };
}

export class ObitoX {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ObitoXConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.obitox.com';
  }

  private async request<T>(
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
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Upload a file in 3-7 lines of code!
   * @param options Upload configuration
   * @returns Upload URLs and headers
   */
  async upload(options: UploadOptions): Promise<UploadResponse> {
    return this.request<UploadResponse>('/api/v1/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Track upload events for analytics
   * @param options Analytics data
   */
  async track(options: AnalyticsOptions): Promise<AnalyticsResponse> {
    return this.request<AnalyticsResponse>('/api/v1/analytics/track', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Validate your API key
   */
  async validate(): Promise<ValidateApiKeyResponse> {
    return this.request<ValidateApiKeyResponse>('/api/v1/apikeys/validate');
  }

  /**
   * Upload file with automatic tracking
   * @param file File to upload
   * @param options Upload options
   * @returns File URL after successful upload
   */
  async uploadFile(
    file: File | Blob,
    options: Omit<UploadOptions, 'filename' | 'contentType'>
  ): Promise<string> {
    const filename = file instanceof File ? file.name : 'uploaded-file';
    const contentType = file instanceof File ? file.type : 'application/octet-stream';

    // Convert file to base64 for server-side upload
    const fileBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(fileBuffer).toString('base64');

    // Use server-side upload endpoint with provider
    const response = await this.request<{success: boolean, url: string}>(`/api/v1/upload/${options.provider.toLowerCase()}-upload`, {
      method: 'POST',
      body: JSON.stringify({
        filename,
        contentType,
        file: base64Data,
        token: options.token
      }),
    });

    // Track completion
    await this.track({
      event: 'completed',
      fileUrl: response.url,
      filename,
      fileSize: file instanceof File ? file.size : fileBuffer.byteLength,
      provider: options.provider.toLowerCase(),
    });

    return response.url;
  }
}

// Default export
export default ObitoX; 