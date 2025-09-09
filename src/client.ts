export interface ObitoXConfig {
  apiKey: string;
}

export interface ImageOptimizationOptions {
  // Easy mode - automatic optimization
  auto?: boolean; // Automatically apply best optimization settings
  
  // Advanced mode - manual control
  format?: 'auto' | 'jpeg' | 'png' | 'webp' | 'preserve'; // Image format conversion
  quality?: 'normal' | 'better' | 'best' | 'lighter' | 'lightest'; // Quality presets
  progressive?: boolean; // Progressive JPEG loading
  stripMeta?: 'all' | 'none' | 'sensitive'; // Metadata stripping
  adaptiveQuality?: boolean; // Enable adaptive quality (Uploadcare only)
}

export interface UploadOptions {
  filename: string;
  contentType?: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY' | 'UPLOADCARE';
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  uploadcarePublicKey?: string; // Developer's Uploadcare public key
  uploadcareSecretKey?: string; // Developer's Uploadcare secret key
  bucket?: string; // Bucket name (for Supabase, AWS, etc.)
  expiresIn?: number; // For signed URLs (in seconds) - Supabase only
  checkVirus?: boolean; // Automatically scan for viruses (Uploadcare only)
  imageOptimization?: ImageOptimizationOptions; // Image optimization settings (Uploadcare only)
  onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void;
  onCancel?: () => void;
}

export interface CancelUploadOptions {
  uploadId: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY' | 'UPLOADCARE';
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  uploadcarePublicKey?: string; // Developer's Uploadcare public key
  uploadcareSecretKey?: string; // Developer's Uploadcare secret key
  bucket?: string; // Bucket name (for Supabase, AWS, etc.)
}

export interface DeleteFileOptions {
  fileUrl: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY' | 'UPLOADCARE';
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  uploadcarePublicKey?: string; // Developer's Uploadcare public key
  uploadcareSecretKey?: string; // Developer's Uploadcare secret key
  bucket?: string; // Bucket name (for Supabase, AWS, etc.)
}

export interface DownloadFileOptions {
  fileUrl?: string;
  filename?: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY' | 'UPLOADCARE';
  bucket?: string;
  expiresIn?: number; // For signed URLs (in seconds)
  vercelToken?: string; // Developer's Vercel token
  supabaseToken?: string; // Developer's Supabase service key
  supabaseUrl?: string; // Developer's Supabase project URL
  uploadcarePublicKey?: string; // Developer's Uploadcare public key
  uploadcareSecretKey?: string; // Developer's Uploadcare secret key
}

export interface ListBucketsOptions {
  provider: 'SUPABASE' | 'AWS' | 'CLOUDINARY' | 'UPLOADCARE';
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
    formData?: Record<string, string>; // For Uploadcare form data
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

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = 'http://localhost:5500'; // Internal API endpoint - not exposed to developers
  }

  /**
   * Build optimized Uploadcare URL with image transformations
   * @param baseUrl - Base Uploadcare URL
   * @param optimization - Image optimization options
   * @param filename - Original filename for validation
   * @param contentType - Original content type for validation
   * @returns string - Optimized URL with transformations
   */
  private buildOptimizedUploadcareUrl(baseUrl: string, optimization: ImageOptimizationOptions, filename: string, contentType: string): string {
    // Validate inputs
    if (!baseUrl || !optimization) {
      throw new Error('Invalid parameters: baseUrl and optimization are required');
    }
    
    // Check if file is an image
    const isImage = this.isImageFile(filename, contentType);
    if (!isImage) {
      throw new Error(`Image optimization can only be applied to image files. File "${filename}" (${contentType}) is not an image.`);
    }
    
    // Extract components from the URL (format: https://domain.com/uuid/filename)
    const urlParts = baseUrl.split('/');
    if (urlParts.length < 4) {
      throw new Error('Invalid Uploadcare URL format');
    }
    
    const domain = urlParts.slice(0, 3).join('/'); // https://domain.com
    const uuid = urlParts[urlParts.length - 2];
    const urlFilename = urlParts[urlParts.length - 1];
    
    // Validate UUID format (basic check)
    if (!uuid || uuid.length < 8) {
      throw new Error('Invalid UUID in Uploadcare URL');
    }
    
    // Build transformation string
    const transformations: string[] = [];
    
    // Uploadcare requires at least one size operation when using image transformations
    // Add preview operation to produce the biggest possible image without changing size
    transformations.push('preview');
    
    // Auto mode - apply best optimization settings automatically
    if (optimization.auto === true) {
      // Auto mode: WebP format, smart quality, progressive loading
      transformations.push('format/webp');
      transformations.push('quality/smart');
      transformations.push('progressive/yes');
    } else {
      // Manual mode - use individual settings
      
      // Format transformation
      if (optimization.format && optimization.format !== 'auto') {
        transformations.push(`format/${optimization.format}`);
      }
      
      // Quality transformation - map our presets to Uploadcare values
      if (optimization.quality && optimization.quality !== 'normal') {
        let qualityValue: string;
        switch (optimization.quality) {
          case 'better': qualityValue = 'smart'; break;
          case 'best': qualityValue = 'smart'; break;
          case 'lighter': qualityValue = 'smart'; break;
          case 'lightest': qualityValue = 'smart'; break;
          default: qualityValue = 'smart';
        }
        transformations.push(`quality/${qualityValue}`);
      }
      
      // Progressive transformation
      if (optimization.progressive === true) {
        transformations.push('progressive/yes');
      } else if (optimization.progressive === false) {
        transformations.push('progressive/no');
      }
      
      // Strip meta transformation - temporarily disabled due to API issues
      // if (optimization.stripMeta && optimization.stripMeta !== 'all') {
      //   transformations.push(`strip_meta/${optimization.stripMeta}`);
      // }
    }
    
    // Build the optimized URL using the original domain
    if (transformations.length > 0) {
      const transformationString = transformations.join('/-/');
      return `${domain}/${uuid}/-/${transformationString}/${urlFilename}`;
    }
    
    return baseUrl;
  }

  /**
   * Check if a file is an image based on filename and content type
   * @param filename - File name
   * @param contentType - MIME type
   * @returns boolean - True if file is an image
   */
  private isImageFile(filename: string, contentType: string): boolean {
    // Check by content type first (most reliable)
    if (contentType && contentType.startsWith('image/')) {
      return true;
    }
    
    // Check by file extension as fallback
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico', '.avif', '.heic', '.heif'];
    const lowerFilename = filename.toLowerCase();
    
    return imageExtensions.some(ext => lowerFilename.endsWith(ext));
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

    // Most providers use signed URLs for zero bandwidth cost
    let signedUrlResult;
    if (options.provider === 'UPLOADCARE') {
      // For Uploadcare, get signed URL for direct upload
      signedUrlResult = await this.upload({
          filename,
          contentType,
        provider: options.provider,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey,
        fileSize: file.size, // Include file size for provider limit validation
        imageOptimization: options.imageOptimization
      });
    } else {
      // For other providers, get signed URL
      signedUrlResult = await this.upload({
        filename,
        contentType,
        provider: options.provider,
        vercelToken: options.vercelToken,
        supabaseToken: options.supabaseToken,
        supabaseUrl: options.supabaseUrl,
        bucket: options.bucket,
        expiresIn: options.expiresIn,
        fileSize: file.size // Include file size for provider limit validation
      });
    }

    // Upload directly to storage provider (bypasses your server completely)
    let uploadResponse;
    
    if (options.provider === 'SUPABASE') {
      // For Supabase, use uploadToSignedUrl method
      if (!signedUrlResult.data.token || !signedUrlResult.data.bucket) {
        throw new Error('Missing required Supabase upload parameters: token or bucket');
      }
      
      uploadResponse = await this.uploadToSupabaseSignedUrl(
        signedUrlResult.data.uploadUrl || '',
        signedUrlResult.data.token || '',
        signedUrlResult.data.filename || filename,
        signedUrlResult.data.bucket || '',
        file,
        options.onProgress,
        options.onCancel
      );
    } else if (options.provider === 'VERCEL') {
      // For Vercel, use the Vercel Blob SDK directly (bypass server URL generation)
      uploadResponse = await this.uploadToVercelBlob(
        signedUrlResult.data.filename || filename, // Use filename instead of uploadUrl
        file,
        options.vercelToken!,
        options.onProgress,
        options.onCancel
      );
    } else if (options.provider === 'UPLOADCARE') {
      // For Uploadcare, use direct upload to Uploadcare's API
      uploadResponse = await this.uploadToUploadcare(
        signedUrlResult.data.uploadUrl || '',
        file,
        signedUrlResult.data.formData || {},
        options.onProgress,
        options.onCancel
      );
    } else {
      // For other providers (AWS, etc.), use direct PUT
      uploadResponse = await this.uploadWithProgress(
        signedUrlResult.data.uploadUrl || '',
        file,
        signedUrlResult.upload?.headers || {},
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
    
    // For Supabase, get the correct signed URL with proper expiration
    if (options.provider === 'SUPABASE' && options.bucket === 'admin' && options.expiresIn) {
      try {
        console.log('🔗 Getting signed URL for private Supabase file...');
        const downloadInfo = await this.downloadFile({
          filename: signedUrlResult.data.filename || filename,
          provider: 'SUPABASE',
          supabaseToken: options.supabaseToken,
          supabaseUrl: options.supabaseUrl,
          bucket: options.bucket,
          expiresIn: options.expiresIn
        });
        finalFileUrl = downloadInfo.downloadUrl;
        console.log('✅ Got signed URL with proper expiration');
      } catch (error) {
        console.warn('⚠️ Failed to get signed URL, using original URL:', error);
        // Continue with original URL if download fails
      }
    }
    
    // For Uploadcare, get the correct CDN URL by calling downloadFile
    if (options.provider === 'UPLOADCARE' && (this as any).lastUploadcareUrl) {
      try {
        // Get the correct CDN URL by calling downloadFile
        const downloadInfo = await this.downloadFile({
          fileUrl: (this as any).lastUploadcareUrl,
          provider: 'UPLOADCARE',
          uploadcarePublicKey: options.uploadcarePublicKey,
          uploadcareSecretKey: options.uploadcareSecretKey
        });
        finalFileUrl = downloadInfo.downloadUrl;
        
        // Apply image optimization transformations if specified
        if (options.imageOptimization) {
          try {
            finalFileUrl = this.buildOptimizedUploadcareUrl(finalFileUrl, options.imageOptimization, filename, contentType);
          } catch (optimizationError) {
            const errorMessage = optimizationError instanceof Error ? optimizationError.message : String(optimizationError);
            console.warn('⚠️ Image optimization failed, using original URL:', errorMessage);
            // Continue with original URL if optimization fails
          }
        }
        
        // If virus scanning is enabled, scan the file and delete if infected
        if (options.checkVirus && options.uploadcarePublicKey && options.uploadcareSecretKey) {
          try {
            console.log('🦠 Scanning file for viruses...');
            
            // Initiate virus scan
            const scanResult = await this.scanFileForMalware({
              fileUrl: finalFileUrl,
              provider: 'UPLOADCARE',
              uploadcarePublicKey: options.uploadcarePublicKey,
              uploadcareSecretKey: options.uploadcareSecretKey
            });
            
            // Wait for scan to complete (polling)
            let scanComplete = false;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds timeout
            
            while (!scanComplete && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
              
              const statusResult = await this.checkMalwareScanStatus({
                requestId: scanResult.data.requestId,
                provider: 'UPLOADCARE',
                uploadcarePublicKey: options.uploadcarePublicKey,
                uploadcareSecretKey: options.uploadcareSecretKey
              });
              
              scanComplete = statusResult.data.isComplete;
              attempts++;
            }
            
            if (scanComplete) {
              // Get scan results
              const results = await this.getMalwareScanResults({
                fileUrl: finalFileUrl,
                provider: 'UPLOADCARE',
                uploadcarePublicKey: options.uploadcarePublicKey,
                uploadcareSecretKey: options.uploadcareSecretKey
              });
              
              if (results.data.isInfected) {
                console.log('🚨 VIRUS DETECTED! Deleting infected file...');
                console.log(`🦠 Infected with: ${results.data.infectedWith}`);
                
                // Delete the infected file
                await this.deleteFile({
                  fileUrl: finalFileUrl,
                  provider: 'UPLOADCARE',
                  uploadcarePublicKey: options.uploadcarePublicKey,
                  uploadcareSecretKey: options.uploadcareSecretKey
                });
                
                throw new Error(`File is infected with virus: ${results.data.infectedWith}. File has been deleted.`);
              } else {
                console.log('✅ File is clean - no viruses detected');
              }
            } else {
              console.log('⚠️ Virus scan timed out - file uploaded but scan incomplete');
            }
          } catch (virusError) {
            // If virus scanning fails, we should still throw the error to prevent using potentially infected files
            const errorMessage = virusError instanceof Error ? virusError.message : String(virusError);
            throw new Error(`Virus scan failed: ${errorMessage}`);
          }
        }
      } catch (error) {
        // Fallback to the basic URL if download fails
        finalFileUrl = (this as any).lastUploadcareUrl;
      }
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
   * Upload to Uploadcare using direct API (zero bandwidth cost)
   * @param uploadUrl - Upload URL from Uploadcare
   * @param file - File or Blob to upload
   * @param formData - Form data parameters for Uploadcare
   * @param onProgress - Progress callback function
   * @param onCancel - Cancel callback function
   * @returns Promise<Response> - Upload response
   */
  private async uploadToUploadcare(
    uploadUrl: string,
    file: File | Blob,
    formData: Record<string, string>,
    onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void,
    onCancel?: () => void
  ): Promise<Response> {
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
      
      // Upload directly to Uploadcare using the correct endpoint
      const response = await fetch('https://upload.uploadcare.com/base/', {
        method: 'POST',
        body: uploadFormData,
        signal: abortController.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Uploadcare upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      
      // Store the UUID for later use - construct proper CDN URL with filename
      const filename = file instanceof File ? file.name : 'uploaded-file';
      (this as any).lastUploadcareUrl = `https://ucarecdn.com/${result.file}/${filename}`;
      
      return response;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Upload cancelled');
      }
      throw new Error(`Uploadcare upload failed: ${error instanceof Error ? error.message : String(error)}`);
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
    uploadcarePublicKey?: string;
    uploadcareSecretKey?: string;
    bucket?: string;
    expiresIn?: number;
    fileSize?: number;
    replaceUrl?: string;
    imageOptimization?: ImageOptimizationOptions;
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
    if (options.uploadcarePublicKey) {
      requestBody.uploadcarePublicKey = options.uploadcarePublicKey;
    }
    if (options.uploadcareSecretKey) {
      requestBody.uploadcareSecretKey = options.uploadcareSecretKey;
    }
    if (options.bucket) {
      requestBody.bucket = options.bucket;
    }
    if (options.expiresIn) {
      requestBody.expiresIn = options.expiresIn;
    }
    if (options.imageOptimization) {
      requestBody.imageOptimization = options.imageOptimization;
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

      // For Uploadcare, cancellation is not applicable (uploads are immediate)
      if (options.provider === 'UPLOADCARE') {
        console.log('⚠️ Upload cancellation not applicable for Uploadcare (uploads are immediate)');
        return true; // Return true since there's nothing to cancel
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
      if (options.uploadcarePublicKey) {
        requestBody.uploadcarePublicKey = options.uploadcarePublicKey;
      }
      if (options.uploadcareSecretKey) {
        requestBody.uploadcareSecretKey = options.uploadcareSecretKey;
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
      if (options.uploadcarePublicKey) {
        requestBody.uploadcarePublicKey = options.uploadcarePublicKey;
      }
      if (options.uploadcareSecretKey) {
        requestBody.uploadcareSecretKey = options.uploadcareSecretKey;
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
      if (options.uploadcarePublicKey) {
        requestBody.uploadcarePublicKey = options.uploadcarePublicKey;
      }
      if (options.uploadcareSecretKey) {
        requestBody.uploadcareSecretKey = options.uploadcareSecretKey;
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

  /**
   * Scan file for malware (Uploadcare only)
   */
  async scanFileForMalware(options: {
    fileUrl?: string;
    uuid?: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { requestId: string; uuid: string; status: string; provider: string; scanType: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/scan-malware`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        fileUrl: options.fileUrl,
        uuid: options.uuid,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Malware scan initiation failed');
    }

    return await response.json();
  }

  /**
   * Check malware scan status (Uploadcare only)
   */
  async checkMalwareScanStatus(options: {
    requestId: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { requestId: string; status: string; isComplete: boolean; provider: string; scanType: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/scan-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        requestId: options.requestId,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Malware scan status check failed');
    }

    return await response.json();
  }

  /**
   * Get malware scan results (Uploadcare only)
   */
  async getMalwareScanResults(options: {
    fileUrl?: string;
    uuid?: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { uuid: string; hasScanResults: boolean; isInfected: boolean; infectedWith: string | null; scanDate: string | null; lastUpdated: string | null; scanVersion: string | null; provider: string; scanType: string; rawData: any; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/scan-results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        fileUrl: options.fileUrl,
        uuid: options.uuid,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Malware scan results retrieval failed');
    }

    return await response.json();
  }

  /**
   * Remove infected file (Uploadcare only)
   */
  async removeInfectedFile(options: {
    fileUrl?: string;
    uuid?: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { requestId: string; uuid: string; status: string; provider: string; scanType: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/remove-infected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        fileUrl: options.fileUrl,
        uuid: options.uuid,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Infected file removal failed');
    }

    return await response.json();
  }

  /**
   * Validate file before upload (Uploadcare only)
   */
  async validateFile(options: {
    filename: string;
    contentType: string;
    fileSize: number;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
    maxFileSize?: number;
    allowedMimeTypes?: string[];
    blockMimeTypes?: string[];
    enableSvgValidation?: boolean;
  }): Promise<{ success: boolean; data: { isValid: boolean; errors: string[]; warnings: string[]; fileInfo: any; provider: string; validationType: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        filename: options.filename,
        contentType: options.contentType,
        fileSize: options.fileSize,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey,
        maxFileSize: options.maxFileSize,
        allowedMimeTypes: options.allowedMimeTypes,
        blockMimeTypes: options.blockMimeTypes,
        enableSvgValidation: options.enableSvgValidation
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'File validation failed');
    }

    return await response.json();
  }

  /**
   * Get Uploadcare project settings (Uploadcare only)
   */
  async getProjectSettings(options: {
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { projectSettings: any; provider: string; settingsType: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/project-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Project settings retrieval failed');
    }

    return await response.json();
  }

  /**
   * Validate SVG file for JavaScript content (Uploadcare only)
   */
  async validateSvg(options: {
    fileUrl?: string;
    uuid?: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { uuid: string; isValid: boolean; hasJavaScript: boolean; detectedPatterns: string[]; securityRisk: boolean; provider: string; validationType: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/validate-svg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        fileUrl: options.fileUrl,
        uuid: options.uuid,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'SVG validation failed');
    }

    return await response.json();
  }

  /**
   * List files from a storage provider
   * @param options - List options
   * @returns Promise<any> - List of files
   */
  async listFiles(options: {
    provider: 'VERCEL' | 'SUPABASE' | 'UPLOADCARE';
    vercelToken?: string;
    supabaseToken?: string;
    supabaseUrl?: string;
    uploadcarePublicKey?: string;
    uploadcareSecretKey?: string;
    bucket?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const endpoint = `${this.baseUrl}/api/v1/upload/${options.provider.toLowerCase()}/list`;
    
    const requestBody: any = {
      limit: options.limit || 100,
      offset: options.offset || 0
    };

    // Add provider-specific parameters
    if (options.provider === 'VERCEL' && options.vercelToken) {
      requestBody.vercelToken = options.vercelToken;
    }
    if (options.provider === 'SUPABASE' && options.supabaseToken && options.supabaseUrl) {
      requestBody.supabaseToken = options.supabaseToken;
      requestBody.supabaseUrl = options.supabaseUrl;
      if (options.bucket) {
        requestBody.bucket = options.bucket;
      }
    }
    if (options.provider === 'UPLOADCARE' && options.uploadcarePublicKey && options.uploadcareSecretKey) {
      requestBody.uploadcarePublicKey = options.uploadcarePublicKey;
      requestBody.uploadcareSecretKey = options.uploadcareSecretKey;
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

    const result = await response.json();
    return result.data || result;
  }

  /**
   * Optimize image with Uploadcare (Uploadcare only)
   * @param options - Image optimization options
   * @returns Promise<string> - Optimized image URL
   */
  async optimizeImage(options: {
    fileUrl: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
    format?: 'auto' | 'jpeg' | 'png' | 'webp' | 'preserve';
    quality?: 'normal' | 'better' | 'best' | 'lighter' | 'lightest';
    progressive?: boolean;
    stripMeta?: 'all' | 'none' | 'sensitive';
    adaptiveQuality?: boolean;
  }): Promise<string> {
    // Validate inputs
    if (!options.fileUrl) {
      throw new Error('File URL is required for image optimization');
    }
    
    if (!options.uploadcarePublicKey || !options.uploadcareSecretKey) {
      throw new Error('Uploadcare credentials are required for image optimization');
    }
    
    // Extract filename from URL for validation
    const urlParts = options.fileUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    
    // Basic image file validation
    if (!this.isImageFile(filename, '')) {
      throw new Error(`Image optimization can only be applied to image files. File "${filename}" does not appear to be an image.`);
    }
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        fileUrl: options.fileUrl,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey,
        format: options.format,
        quality: options.quality,
        progressive: options.progressive,
        stripMeta: options.stripMeta,
        adaptiveQuality: options.adaptiveQuality
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Image optimization failed');
    }

    const result = await response.json();
    return result.data.optimizedUrl;
  }

  /**
   * Get image optimization info (Uploadcare only)
   * @param options - Image info options
   * @returns Promise<any> - Image optimization information
   */
  async getImageOptimizationInfo(options: {
    fileUrl: string;
    provider: 'UPLOADCARE';
    uploadcarePublicKey: string;
    uploadcareSecretKey: string;
  }): Promise<{ success: boolean; data: { originalSize: number; optimizedSize: number; compressionRatio: number; format: string; quality: string; provider: string; } }> {
    const response = await fetch(`${this.baseUrl}/api/v1/upload/uploadcare/image-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        fileUrl: options.fileUrl,
        uploadcarePublicKey: options.uploadcarePublicKey,
        uploadcareSecretKey: options.uploadcareSecretKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Image info retrieval failed');
    }

    return await response.json();
  }

}

export default ObitoX; 
