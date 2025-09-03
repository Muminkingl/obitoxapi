export interface ObitoXConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface UploadOptions {
  filename: string;
  contentType?: string;
  provider: 'VERCEL' | 'AWS' | 'CLOUDINARY';
  vercelToken: string; // Changed from 'token'
  onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void;
}

export interface UploadResponse {
  success: boolean;
  data: {
    uploadUrl: string;
    fileUrl: string;
    filename: string;
    method: string;
  };
  upload: {
    headers: Record<string, string>;
  };
}

export interface TrackOptions {
  event: 'initiated' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  fileUrl: string;
  filename?: string;
  fileSize?: number;
  provider?: string;
  error?: string;
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

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.obitox.com';
  }

  /**
   * Upload a file using the provider system with progress tracking
   * @param file - File or Blob to upload
   * @param options - Upload options including provider and progress callback
   * @returns Promise<string> - The final file URL
   */
  async uploadFile(
    file: File | Blob,
    options: Omit<UploadOptions, 'filename' | 'contentType'>
  ): Promise<string> {
    const filename = file instanceof File ? file.name : 'uploaded-file';
    const contentType = file instanceof File ? file.type : 'application/octet-stream';

    // Get signed URL from server (NO file data sent, but include file size for validation)
    const signedUrlResult = await this.upload({
      filename,
      contentType,
      provider: options.provider,
      vercelToken: options.vercelToken, // Mapped to vercelToken
      fileSize: file.size // Include file size for Vercel Blob limit validation
    });

    // Upload directly to Vercel (bypasses your server completely)
    const uploadResponse = await this.uploadWithProgress(
      signedUrlResult.data.uploadUrl,
      file,
      signedUrlResult.upload.headers,
      options.onProgress
    );

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    // Track completion for analytics
    await this.track({
      event: 'completed',
      fileUrl: signedUrlResult.data.fileUrl,
      filename,
      fileSize: file instanceof File ? file.size : file.size || 0,
      provider: options.provider.toLowerCase(),
    });

    return signedUrlResult.data.fileUrl;
  }

    /**
   * Upload with progress tracking using fetch for Node.js compatibility
   * @param url - Upload URL
   * @param file - File or Blob to upload
   * @param headers - Headers to include in the request
   * @param onProgress - Progress callback function
   * @returns Promise<Response> - Upload response
   */
  private async uploadWithProgress(
    url: string,
    file: File | Blob,
    headers: Record<string, string>,
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void
  ): Promise<Response> {
    // For Node.js environments, use fetch with simulated progress
    if (onProgress) {
      // Simulate progress updates for Node.js
      const totalBytes = file.size;
      let bytesUploaded = 0;
      
      // Start progress simulation
      const progressInterval = setInterval(() => {
        bytesUploaded += Math.ceil(totalBytes / 10); // Simulate 10% increments
        if (bytesUploaded >= totalBytes) {
          bytesUploaded = totalBytes;
          clearInterval(progressInterval);
        }
        
        const progress = (bytesUploaded / totalBytes) * 100;
        onProgress(progress, bytesUploaded, totalBytes);
      }, 100); // Update every 100ms
      
      // Clean up interval after upload completes
      setTimeout(() => clearInterval(progressInterval), 5000);
    }
    
    // Use fetch for the actual upload
    return fetch(url, {
      method: 'PUT',
      body: file,
      headers: headers
    });
  }

  /**
   * Alternative upload method using fetch with progress tracking (for environments without XMLHttpRequest)
   * @param url - Upload URL
   * @param file - File or Blob to upload
   * @param headers - Headers to include in the request
   * @param onProgress - Progress callback function
   * @returns Promise<Response> - Upload response
   */
  private async uploadWithFetchProgress(
    url: string,
    file: File | Blob,
    headers: Record<string, string>,
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void
  ): Promise<Response> {
    // Create a ReadableStream to track progress
    const totalBytes = file.size;
    let bytesUploaded = 0;

    const stream = new ReadableStream({
      start(controller) {
        const reader = file.stream().getReader();
        
        function pump(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            
            bytesUploaded += value.length;
            if (onProgress) {
              const progress = (bytesUploaded / totalBytes) * 100;
              onProgress(progress, bytesUploaded, totalBytes);
            }
            
            controller.enqueue(value);
            return pump();
          });
        }
        
        return pump();
      }
    });

    // Upload with progress tracking
    return fetch(url, {
      method: 'PUT',
      body: stream,
      headers: headers
    });
  }

  /**
   * Get signed URL from server
   * @param options - Upload options
   * @returns Promise<UploadResponse> - Signed URL response
   */
  private async upload(options: {
    filename: string;
    contentType: string;
    provider: string;
    vercelToken: string;
    fileSize?: number;
  }): Promise<UploadResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/vercel/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        filename: options.filename,
        contentType: options.contentType,
        provider: options.provider,
        vercelToken: options.vercelToken,
        fileSize: options.fileSize
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Track upload events for analytics
   * @param options - Tracking options
   * @returns Promise<void>
   */
  async track(options: TrackOptions): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/v1/upload/vercel/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          event: options.event,
          fileUrl: options.fileUrl,
          filename: options.filename,
          fileSize: options.fileSize,
          provider: options.provider,
          error: options.error
        })
      });
    } catch (error) {
      // Non-blocking - analytics failures shouldn't break the upload
      console.warn('Failed to track upload event:', error);
    }
  }

  /**
   * Check provider health status
   * @param provider - Storage provider to check
   * @returns Promise<boolean> - Health status
   */
  async checkHealth(provider: string = 'vercel'): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/upload/${provider}/health`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.success && data.status === 'operational';
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get upload statistics for the current API key
   * @returns Promise<any> - Upload statistics
   */
  async getStats(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/upload/stats`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey
        }
      });

      if (response.ok) {
        return await response.json();
      }

      throw new Error(`Failed to fetch stats: ${response.status}`);
    } catch (error) {
      throw new Error(`Failed to fetch upload statistics: ${error}`);
    }
  }
}

export default ObitoX; 