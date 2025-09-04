export interface ObitoXConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface UploadOptions {
  filename: string;
  contentType?: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  bucket?: string; // Bucket name (for Supabase, AWS, etc.)
  onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void;
  onCancel?: () => void;
}

export interface CancelUploadOptions {
  uploadId: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  bucket?: string; // Bucket name (for Supabase, AWS, etc.)
}

export interface DeleteFileOptions {
  fileUrl: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  bucket?: string; // Bucket name (for Supabase, AWS, etc.)
}

export interface DownloadFileOptions {
  fileUrl?: string;
  filename?: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  bucket?: string;
  expiresIn?: number; // For signed URLs (in seconds)
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
}

export interface ListBucketsOptions {
  provider: 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
}

export interface BucketInfo {
  name: string;
  public: boolean;
  fileCount?: number;
  totalSize?: number;
  createdAt?: string;
}



export interface UploadResponse {
  success: boolean;
  data: {
  uploadUrl: string;
  fileUrl: string;
  filename: string;
  method: string;
    token?: string; // For Supabase signed URLs
    bucket?: string; // For Supabase signed URLs
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

    // All providers now use signed URLs for zero bandwidth cost
    const signedUrlResult = await this.upload({
        filename,
        contentType,
      provider: options.provider,
      vercelToken: options.vercelToken,
      supabaseToken: options.supabaseToken,
      supabaseUrl: options.supabaseUrl,
      bucket: options.bucket,
      fileSize: file.size // Include file size for provider limit validation
    });

    // Upload directly to storage provider (bypasses your server completely)
    let uploadResponse;
    
    if (options.provider === 'SUPABASE') {
      // For Supabase, use uploadToSignedUrl method
      if (!signedUrlResult.data.token || !signedUrlResult.data.bucket) {
        throw new Error('Missing required Supabase upload parameters: token or bucket');
      }
      
      uploadResponse = await this.uploadToSupabaseSignedUrl(
        signedUrlResult.data.uploadUrl,
        signedUrlResult.data.token,
        signedUrlResult.data.filename,
        signedUrlResult.data.bucket,
        file,
        options.onProgress,
        options.onCancel
      );
    } else if (options.provider === 'VERCEL') {
      // For Vercel, use the Vercel Blob SDK directly (bypass server URL generation)
      uploadResponse = await this.uploadToVercelBlob(
        signedUrlResult.data.filename, // Use filename instead of uploadUrl
        file,
        options.vercelToken!,
        options.onProgress,
        options.onCancel
      );
    } else {
      // For other providers (AWS, etc.), use direct PUT
      uploadResponse = await this.uploadWithProgress(
        signedUrlResult.data.uploadUrl,
        file,
        signedUrlResult.upload.headers,
        options.onProgress,
        options.onCancel
      );
    }

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    // Track completion for analytics
    let finalFileUrl = signedUrlResult.data.fileUrl;
    
    // For Vercel, use the actual blob URL from the SDK
    if (options.provider === 'VERCEL' && (this as any).lastVercelBlobUrl) {
      finalFileUrl = (this as any).lastVercelBlobUrl;
    }
    
    await this.track({
      event: 'completed',
      fileUrl: finalFileUrl,
      filename,
      fileSize: file instanceof File ? file.size : file.size || 0,
      provider: options.provider.toLowerCase(),
    });

    return finalFileUrl;
  }

  /**
   * Upload to Supabase using signed URL (zero bandwidth cost)
   * @param signedUrl - Signed upload URL from Supabase
   * @param token - Upload token from Supabase
   * @param filename - Target filename
   * @param bucket - Target bucket
   * @param file - File or Blob to upload
   * @param onProgress - Progress callback function
   * @param onCancel - Cancel callback function
   * @returns Promise<Response> - Upload response
   */
  private async uploadToSupabaseSignedUrl(
    signedUrl: string,
    token: string,
    filename: string,
    bucket: string,
    file: File | Blob,
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    onCancel?: () => void
  ): Promise<Response> {
    // For Node.js environments, we'll simulate the Supabase client uploadToSignedUrl
    // In a real browser environment, you would use the Supabase client
    
    // Create AbortController for cancellation
    const abortController = new AbortController();
    
    // Store the abort controller for potential cancellation
    (this as any).currentUploadController = abortController;
    
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
    
    // Use fetch to upload directly to Supabase signed URL
    return fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file instanceof File ? file.type : 'application/octet-stream'
      },
      body: file,
      signal: abortController.signal
    });
  }

  /**
   * Upload to Vercel Blob using the Vercel Blob SDK (zero bandwidth cost)
   * @param filename - Target filename
   * @param file - File or Blob to upload
   * @param vercelToken - Vercel Blob token
   * @param onProgress - Progress callback function
   * @param onCancel - Cancel callback function
   * @returns Promise<Response> - Upload response
   */
  private async uploadToVercelBlob(
    filename: string,
    file: File | Blob,
    vercelToken: string,
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    onCancel?: () => void
  ): Promise<Response> {
    // For Node.js environments, we'll use the Vercel Blob SDK
    // In a real browser environment, you would use the Vercel Blob SDK
    
    // Create AbortController for cancellation
    const abortController = new AbortController();
    
    // Store the abort controller for potential cancellation
    (this as any).currentUploadController = abortController;
    
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
    
    // Use the Vercel Blob SDK to upload
    try {
      // Import the Vercel Blob SDK dynamically
      const { put } = await import('@vercel/blob');
      
      // Upload using the Vercel Blob SDK
      const blob = await put(filename, file, {
        token: vercelToken,
        access: 'public' // Make the blob publicly accessible
      });
      
      // Store the actual blob URL for later use
      (this as any).lastVercelBlobUrl = blob.url;
      
      // Return a proper Response object
      return new Response(JSON.stringify({ url: blob.url }), {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
    } catch (error) {
      // If the SDK fails, throw an error
      throw new Error(`Vercel Blob upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    onCancel?: () => void
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
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    onCancel?: () => void
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
    vercelToken?: string;
    supabaseToken?: string;
    supabaseUrl?: string;
    bucket?: string;
    fileSize?: number;
    replaceUrl?: string;
  }): Promise<UploadResponse> {
    // Determine the correct endpoint based on provider
    const providerEndpoint = options.provider.toLowerCase();
    const endpoint = `${this.baseUrl}/api/v1/upload/${providerEndpoint}/signed-url`;
    
    const requestBody: any = {
      filename: options.filename,
      contentType: options.contentType,
      provider: options.provider,
      fileSize: options.fileSize
    };

    // Add developer's provider tokens
    if (options.vercelToken) {
      requestBody.vercelToken = options.vercelToken;
    }
    if (options.supabaseToken) {
      requestBody.supabaseToken = options.supabaseToken;
    }
    if (options.supabaseUrl) {
      requestBody.supabaseUrl = options.supabaseUrl;
    }
    if (options.bucket) {
      requestBody.bucket = options.bucket;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify(requestBody)
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
      // Use the provider-specific track endpoint
      const providerEndpoint = options.provider?.toLowerCase() || 'vercel';
      const endpoint = `${this.baseUrl}/api/v1/upload/${providerEndpoint}/track`;
      
      await fetch(endpoint, {
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

  /**
   * Cancel an ongoing upload
   * @param options - Cancel options
   * @returns Promise<boolean> - Success status
   */
  async cancelUpload(options: CancelUploadOptions): Promise<boolean> {
    try {
      // For Supabase, cancel the current upload directly
      if (options.provider === 'SUPABASE') {
        const controller = (this as any).currentUploadController;
        console.log('🔍 Cancel called, controller exists:', !!controller);
        if (controller) {
          console.log('🚫 Aborting controller...');
          controller.abort();
          return true;
        }
        console.log('❌ No controller found to cancel');
        return false;
      }

      // For other providers, use the backend cancel endpoint
      const requestBody: any = {
        uploadId: options.uploadId
      };

      // Add developer's provider tokens
      if (options.vercelToken) {
        requestBody.vercelToken = options.vercelToken;
      }
      if (options.supabaseToken) {
        requestBody.supabaseToken = options.supabaseToken;
      }
      if (options.supabaseUrl) {
        requestBody.supabaseUrl = options.supabaseUrl;
      }
      if (options.bucket) {
        requestBody.bucket = options.bucket;
      }

      const response = await fetch(`${this.baseUrl}/api/v1/upload/${options.provider.toLowerCase()}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        return data.success;
      }

      return false;
    } catch (error) {
      console.warn('Failed to cancel upload:', error);
      return false;
    }
  }

  /**
   * Download a file from storage (public or private)
   * @param options - Download options including file URL/filename and provider
   * @returns Promise<{downloadUrl: string, filename: string, fileSize: number, contentType: string, isPrivate: boolean, expiresAt?: string}>
   */
  async downloadFile(options: DownloadFileOptions): Promise<{
    downloadUrl: string;
    filename: string;
    fileSize: number;
    contentType: string;
    isPrivate: boolean;
    expiresAt?: string;
    expiresIn?: number;
    bucket: string;
    provider: string;
  }> {
    try {
      const requestBody: any = {};

      // Add file identifier (either fileUrl or filename)
      if (options.fileUrl) {
        requestBody.fileUrl = options.fileUrl;
      } else if (options.filename) {
        requestBody.filename = options.filename;
      } else {
        throw new Error('Either fileUrl or filename is required');
      }

      // Add optional parameters
      if (options.bucket) {
        requestBody.bucket = options.bucket;
      }
      if (options.expiresIn) {
        requestBody.expiresIn = options.expiresIn;
      }

      // Add developer's provider tokens
      if (options.vercelToken) {
        requestBody.vercelToken = options.vercelToken;
      }
      if (options.supabaseToken) {
        requestBody.supabaseToken = options.supabaseToken;
      }
      if (options.supabaseUrl) {
        requestBody.supabaseUrl = options.supabaseUrl;
      }
      if (options.bucket) {
        requestBody.bucket = options.bucket;
      }

      const response = await fetch(`${this.baseUrl}/api/v1/upload/${options.provider.toLowerCase()}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Download failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Download request failed');
      }

      return {
        downloadUrl: result.data.downloadUrl,
        filename: result.data.filename,
        fileSize: result.data.fileSize,
        contentType: result.data.contentType,
        isPrivate: result.data.isPrivate,
        expiresAt: result.data.expiresAt,
        expiresIn: result.data.expiresIn,
        bucket: result.data.bucket,
        provider: result.data.provider
      };

    } catch (error: any) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  /**
   * List available buckets for a provider
   * @param options - List buckets options
   * @returns Promise<BucketInfo[]> - Array of bucket information
   */
  async listBuckets(options: ListBucketsOptions): Promise<BucketInfo[]> {
    try {
      const requestBody: any = {};

      // Add developer's provider tokens
      if (options.supabaseToken) {
        requestBody.supabaseToken = options.supabaseToken;
      }
      if (options.supabaseUrl) {
        requestBody.supabaseUrl = options.supabaseUrl;
      }

      const response = await fetch(`${this.baseUrl}/api/v1/upload/${options.provider.toLowerCase()}/buckets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data || [];

    } catch (error: any) {
      console.error('❌ Failed to list buckets:', error.message);
      throw error;
    }
  }

  /**
   * Delete a file from storage
   * @param options - Delete options
   * @returns Promise<boolean> - Success status
   */
  async deleteFile(options: DeleteFileOptions): Promise<boolean> {
    try {
      const requestBody: any = {
        fileUrl: options.fileUrl
      };

      // Add developer's provider tokens
      if (options.vercelToken) {
        requestBody.vercelToken = options.vercelToken;
      }
      if (options.supabaseToken) {
        requestBody.supabaseToken = options.supabaseToken;
      }
      if (options.supabaseUrl) {
        requestBody.supabaseUrl = options.supabaseUrl;
      }
      if (options.bucket) {
        requestBody.bucket = options.bucket;
      }

      const response = await fetch(`${this.baseUrl}/api/v1/upload/${options.provider.toLowerCase()}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      // For delete operations, we need to handle different response codes
      if (response.ok) {
        // 200-299: Success
        const data = await response.json();
        return data.success;
      } else if (response.status === 404) {
        
        // 404: File not found or already deleted - this could be success
        try {
          const data = await response.json();
          if (data.code === 'FILE_NOT_FOUND') {
            // File was already deleted or never existed - treat as success
            console.log('ℹ️ File not found or already deleted - treating as successful deletion');
            return true;
          }
        } catch (parseError) {
          // If we can't parse the response, still treat 404 as potential success
          console.log('ℹ️ 404 response - file may have been deleted successfully');
          return true;
        }
      }

      // For other error statuses, return false
      return false;
    } catch (error) {
      console.warn('Failed to delete file:', error);
      return false;
    }
  }

}

export default ObitoX; 
