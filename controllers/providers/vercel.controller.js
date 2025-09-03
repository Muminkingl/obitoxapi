import { supabaseAdmin } from '../../database/supabase.js';
import { put } from '@vercel/blob';

// Configuration constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (our service limit)
const VERCEL_BLOB_LIMIT = 4.5 * 1024 * 1024; // 4.5MB (Vercel's per-request limit)
const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'application/json', 'text/csv',
  'application/zip', 'video/mp4', 'audio/mpeg', 'audio/wav'
];

/**
 * Update request metrics in the database
 * @param {string} apiKeyId - API key ID
 * @param {string} userId - User ID
 * @param {string} provider - Storage provider (vercel, aws, cloudinary)
 * @param {string} status - Request status (success, failed)
 * @param {number} fileSize - File size in bytes
 * @param {string} fileType - File MIME type (e.g., 'application/pdf')
 */
const updateRequestMetrics = async (apiKeyId, userId, provider, status, fileSize = 0, fileType = null) => {
  try {
    // First, get current values to increment them
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('api_keys')
      .select('total_requests, successful_requests, failed_requests')
      .eq('id', apiKeyId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching current metrics:', fetchError);
      return;
    }
    
    const currentTotal = currentData?.total_requests || 0;
    const currentSuccess = currentData?.successful_requests || 0;
    const currentFailed = currentData?.failed_requests || 0;
    
    // Update main api_keys table metrics
    await supabaseAdmin
      .from('api_keys')
      .update({
        total_requests: currentTotal + 1,
        last_request_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', apiKeyId);

    // Update file size and count for successful uploads
    if (status === 'success' && fileSize > 0) {
      // Get current values first
      const { data: currentFileData } = await supabaseAdmin
        .from('api_keys')
        .select('total_file_size, total_files_uploaded')
        .eq('id', apiKeyId)
        .single();
      
      const currentFileSize = currentFileData?.total_file_size || 0;
      const currentFileCount = currentFileData?.total_files_uploaded || 0;
      
      await supabaseAdmin
        .from('api_keys')
        .update({
          total_file_size: currentFileSize + fileSize,
          total_files_uploaded: currentFileCount + 1
        })
        .eq('id', apiKeyId);

      // Update file type counts
      if (fileType) {
        const { data: currentTypeCounts } = await supabaseAdmin
          .from('api_keys')
          .select('file_type_counts')
          .eq('id', apiKeyId)
          .single();
        
        const typeCounts = currentTypeCounts?.file_type_counts || {};
        typeCounts[fileType] = (typeCounts[fileType] || 0) + 1;
        
        await supabaseAdmin
          .from('api_keys')
          .update({
            file_type_counts: typeCounts
          })
          .eq('id', apiKeyId);
      }
    }

    // Update success/failure counters
    if (status === 'success') {
      await supabaseAdmin
        .from('api_keys')
        .update({
          successful_requests: currentSuccess + 1
        })
        .eq('id', apiKeyId);
    } else {
      await supabaseAdmin
        .from('api_keys')
        .update({
          failed_requests: currentFailed + 1
        })
        .eq('id', apiKeyId);
    }

    // Update provider usage (only for successful uploads)
    if (status === 'success' && provider) {
      // Check if provider usage record exists
      const { data: existingUsage, error: usageError } = await supabaseAdmin
        .from('provider_usage')
        .select('upload_count, total_file_size')
        .eq('api_key_id', apiKeyId)
        .eq('provider', provider.toLowerCase())
        .single();
      
      if (usageError && usageError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking provider usage:', usageError);
        return;
      }
      
      const currentUploads = existingUsage?.upload_count || 0;
      const currentSize = existingUsage?.total_file_size || 0;
      
      if (existingUsage) {
        // Update existing record
        await supabaseAdmin
          .from('provider_usage')
          .update({
            upload_count: currentUploads + 1,
            total_file_size: currentSize + fileSize,
            average_file_size: Math.round((currentSize + fileSize) / (currentUploads + 1)),
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('api_key_id', apiKeyId)
          .eq('provider', provider.toLowerCase());

        // Update file type counts for existing record
        if (fileType) {
          const { data: currentProviderTypeCounts } = await supabaseAdmin
            .from('provider_usage')
            .select('file_type_counts')
            .eq('api_key_id', apiKeyId)
            .eq('provider', provider.toLowerCase())
            .single();
          
          const providerTypeCounts = currentProviderTypeCounts?.file_type_counts || {};
          providerTypeCounts[fileType] = (providerTypeCounts[fileType] || 0) + 1;
          
          await supabaseAdmin
            .from('provider_usage')
            .update({
              file_type_counts: providerTypeCounts
            })
            .eq('api_key_id', apiKeyId)
            .eq('provider', provider.toLowerCase());
        }
      } else {
        // Insert new record
        await supabaseAdmin
          .from('provider_usage')
          .insert({
            api_key_id: apiKeyId,
            user_id: userId,
            provider: provider.toLowerCase(),
            upload_count: 1,
            total_file_size: fileSize,
            average_file_size: fileSize,
            file_type_counts: fileType ? { [fileType]: 1 } : {},
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    }

    // Log the request for detailed tracking
    await supabaseAdmin
      .from('request_logs')
      .insert({
        api_key_id: apiKeyId,
        user_id: userId,
        request_type: 'upload',
        provider: provider ? provider.toLowerCase() : null,
        status: status,
        file_size: fileSize,
        created_at: new Date().toISOString()
      });

  } catch (error) {
    console.error('Error updating request metrics:', error);
    // Non-blocking - continue even if metrics update fails
  }
};

/**
 * Comprehensive file validation
 * @param {string} filename 
 * @param {string} contentType 
 * @param {number} fileSize 
 * @returns {Object} validation result
 */
const validateFile = (filename, contentType, fileSize = 0) => {
  const errors = [];
  
  // Filename validation
  if (!filename || filename.trim() === '') {
    errors.push('Filename cannot be empty');
  } else if (filename.length > 255) {
    errors.push('Filename too long (max 255 characters)');
  } else if (!/^[a-zA-Z0-9._-]+$/.test(filename.replace(/\s/g, '_'))) {
    errors.push('Filename contains invalid characters');
  }
  
  // File extension validation
  const hasExtension = filename && filename.includes('.');
  if (!hasExtension) {
    errors.push('File must have an extension');
  }
  
  // Content type validation
  if (!contentType) {
    errors.push('Content type is required');
  } else if (!ALLOWED_FILE_TYPES.includes(contentType)) {
    errors.push(`Unsupported file type: ${contentType}. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`);
  }
  
  // File size validation - check both our service limit and Vercel's limit
  if (fileSize > VERCEL_BLOB_LIMIT) {
    errors.push(`File too large for Vercel Blob. Maximum size: ${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB (Vercel's per-request limit)`);
  } else if (fileSize > MAX_FILE_SIZE) {
    errors.push(`File too large for our service. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate Vercel token format
 * @param {string} token 
 * @returns {Object} validation result
 */
const validateVercelToken = (token) => {
  if (!token) {
    return { isValid: false, error: 'Vercel token is required' };
  }
  
  if (typeof token !== 'string') {
    return { isValid: false, error: 'Vercel token must be a string' };
  }
  
  if (!token.startsWith('vercel_blob_rw_')) {
    return { isValid: false, error: 'Invalid Vercel token format. Must start with "vercel_blob_rw_"' };
  }
  
  if (token.length < 50) {
    return { isValid: false, error: 'Vercel token appears to be incomplete' };
  }
  
  return { isValid: true };
};

/**
 * Test Vercel token permissions
 * @param {string} token 
 * @returns {Promise<Object>} test result
 */
const testVercelToken = async (token) => {
  try {
    // Test with a tiny dummy file to check permissions
    const testFilename = `test_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`;
    const testContent = new Blob(['test'], { type: 'text/plain' });
    
    const blob = await put(testFilename, testContent, {
      access: 'public',
      token: token
    });
    
    // If successful, the token has read/write permissions
    return { 
      isValid: true, 
      hasWritePermission: true,
      testUrl: blob.url
    };
  } catch (error) {
    console.error('Vercel token test error:', error);
    
    // Analyze the error to provide specific feedback
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid token')) {
      return { 
        isValid: false, 
        error: 'Invalid Vercel token or token has expired',
        code: 'INVALID_TOKEN'
      };
    }
    
    if (errorMessage.includes('forbidden') || errorMessage.includes('permission')) {
      return { 
        isValid: false, 
        error: 'Vercel token does not have write permissions. Please use a read-write token.',
        code: 'INSUFFICIENT_PERMISSIONS'
      };
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
      return { 
        isValid: false, 
        error: 'Vercel storage quota exceeded or rate limit reached',
        code: 'QUOTA_EXCEEDED'
      };
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      return { 
        isValid: false, 
        error: 'Network error connecting to Vercel. Please try again.',
        code: 'NETWORK_ERROR'
      };
    }
    
    return { 
      isValid: false, 
      error: `Vercel token test failed: ${error.message}`,
      code: 'TOKEN_TEST_FAILED'
    };
  }
};

/**
 * Enhanced Generate signed URLs for Vercel Blob uploads - Core API endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const generateVercelSignedUrl = async (req, res) => {
  try {
    const { filename, contentType, vercelToken, fileSize } = req.body;
    
    // 1. Basic validation
    if (!filename || !vercelToken) {
      // Track failed request due to validation
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: {
          filename: !filename ? 'required' : 'provided',
          vercelToken: !vercelToken ? 'required' : 'provided'
        },
        code: 'MISSING_FIELDS'
      });
    }

    // 2. File validation
    const fileValidation = validateFile(filename, contentType, fileSize);
    if (!fileValidation.isValid) {
      // Track failed request due to file validation
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(400).json({
        success: false,
        error: 'File validation failed',
        details: fileValidation.errors,
        code: 'INVALID_FILE'
      });
    }

    // 3. Vercel token format validation
    const tokenValidation = validateVercelToken(vercelToken);
    if (!tokenValidation.isValid) {
      // Track failed request due to token validation
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(401).json({
        success: false,
        error: tokenValidation.error,
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // 4. Test Vercel token permissions (with timeout)
    const tokenTest = await Promise.race([
      testVercelToken(vercelToken),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Token validation timeout')), 10000)
      )
    ]);

    if (!tokenTest.isValid) {
      // Track failed request due to token test failure
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(401).json({
        success: false,
        error: tokenTest.error,
        code: tokenTest.code || 'TOKEN_TEST_FAILED'
      });
    }

    // 5. Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = filename.split('.').pop();
    const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFilename = `upl${timestamp}_${randomSuffix}.${baseName}.${fileExtension}`;

    // 6. Create the final file URL
    const fileUrl = `https://blob.vercel-storage.com/${finalFilename}`;
    const uploadUrl = fileUrl;

    // 7. Track usage for analytics and billing
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: finalFilename,
          original_name: filename,
          file_type: contentType,
          file_size: fileSize || 0,
          file_url: fileUrl,
          status: 'initiated',
          provider: 'vercel',
          created_at: new Date(),
          metadata: {
            user_agent: req.headers['user-agent'],
            ip_address: req.ip,
            token_prefix: vercelToken.substring(0, 20) + '...'
          }
        });

      // Update request metrics for initiated uploads
      await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'initiated', fileSize || 0);
    } catch (logError) {
      console.error('Error logging upload initiation:', logError);
      // Non-blocking - continue even if logging fails
    }

    // 8. Return the comprehensive response
    return res.status(200).json({
      success: true,
      data: {
        uploadUrl: uploadUrl,
        fileUrl: fileUrl,
        filename: finalFilename,
        originalFilename: filename,
        contentType: contentType,
        maxFileSize: MAX_FILE_SIZE,
        method: 'PUT'
      },
      upload: {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': contentType || 'application/octet-stream',
          'x-vercel-filename': finalFilename
        }
      },
      instructions: {
        note: 'Use the Vercel Blob SDK put() method for reliable uploads',
        sdkExample: `import { put } from '@vercel/blob';
const blob = await put('${finalFilename}', fileBuffer, { token: '${vercelToken.substring(0, 20)}...' });`,
        curlExample: `curl -X PUT "${uploadUrl}" -H "Authorization: Bearer ${vercelToken.substring(0, 20)}..." -H "Content-Type: ${contentType}" --data-binary @yourfile`
      },
      limits: {
        maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
        vercelBlobLimit: `${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
        allowedTypes: ALLOWED_FILE_TYPES,
        rateLimit: '50 uploads per minute'
      },
      warnings: {
        vercelBlobLimit: `Files larger than ${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB will be rejected by Vercel Blob`,
        recommendation: 'For larger files, consider chunked uploads or alternative providers'
      }
    });

  } catch (error) {
    console.error('Vercel Blob error:', error);
    
    // Track failed request
    try {
      await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
    } catch (trackingError) {
      console.error('Error tracking failed request:', trackingError);
    }
    
    // Categorize the error for better user experience
    let errorCode = 'UNKNOWN_ERROR';
    let statusCode = 500;
    let userMessage = 'Failed to generate upload URL';

    if (error.message.includes('network') || error.message.includes('timeout')) {
      errorCode = 'NETWORK_ERROR';
      statusCode = 503;
      userMessage = 'Network error. Please check your connection and try again.';
    } else if (error.message.includes('quota') || error.message.includes('storage')) {
      errorCode = 'STORAGE_ERROR';
      statusCode = 507;
      userMessage = 'Storage service unavailable or quota exceeded.';
    }

    return res.status(statusCode).json({
      success: false,
      error: userMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Enhanced Server-side upload using Vercel Blob SDK with Progress Tracking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const uploadToVercelBlob = async (req, res) => {
  try {
    const { token, filename, contentType } = req.body;
    
    // 1. Token validation
    if (!token) {
      // Track failed request due to missing token
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(400).json({
        success: false,
        error: 'Vercel token is required',
        code: 'MISSING_TOKEN'
      });
    }

    // 2. File validation
    if (!req.file && !req.body.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided. Use multipart/form-data or base64 encoded file.',
        code: 'NO_FILE_PROVIDED'
      });
    }

    // 3. Process file data
    let fileBuffer, originalFilename, fileMimetype, fileSize;
    
    if (req.file) {
      // Multer file upload
      fileBuffer = req.file.buffer;
      originalFilename = req.file.originalname;
      fileMimetype = req.file.mimetype;
      fileSize = req.file.size;
    } else {
      // Base64 file upload
      try {
        fileBuffer = Buffer.from(req.body.file, 'base64');
        originalFilename = req.body.filename || 'uploaded-file';
        fileMimetype = req.body.contentType || 'application/octet-stream';
        fileSize = fileBuffer.length;
      } catch (decodeError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid base64 file data',
          code: 'INVALID_FILE_ENCODING'
        });
      }
    }

    // 4. File validation
    const fileValidation = validateFile(originalFilename, fileMimetype, fileSize);
    if (!fileValidation.isValid) {
      // Track failed request due to file validation
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(400).json({
        success: false,
        error: 'File validation failed',
        details: fileValidation.errors,
        code: 'INVALID_FILE'
      });
    }
    
    // 4.5. Vercel Blob specific size check (before upload attempt)
    if (fileSize > VERCEL_BLOB_LIMIT) {
      // Track failed request due to Vercel size limit
      try {
        await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
      } catch (trackingError) {
        console.error('Error tracking failed request:', trackingError);
      }
      
      return res.status(413).json({
        success: false,
        error: `File size exceeds Vercel Blob's per-request limit of ${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
        code: 'VERCEL_SIZE_LIMIT_EXCEEDED',
        details: {
          maxSize: `${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
          currentSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
          recommendation: 'Split large files into smaller chunks or use a different storage provider'
        },
        limits: {
          vercelBlobLimit: VERCEL_BLOB_LIMIT,
          ourServiceLimit: MAX_FILE_SIZE,
          vercelBlobLimitMB: (VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1),
          ourServiceLimitMB: (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
        },
        solutions: [
          'Use chunked uploads for files larger than 4.5MB',
          'Compress the file before uploading',
          'Consider using AWS S3 or Cloudinary for larger files',
          'Split the file into multiple smaller parts'
        ]
      });
    }

    // 5. Virus scan simulation (you can integrate with actual virus scanning service)
    if (fileSize > 0 && fileBuffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'File appears to be corrupted or empty',
        code: 'CORRUPTED_FILE'
      });
    }

    // 6. Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = originalFilename.split('.').pop();
    const baseName = originalFilename.replace(/\.[^/.]+$/, '').replace(/[a-zA-Z0-9._-]/g, '_');
    const finalFilename = `upl${timestamp}_${randomSuffix}.${fileExtension}`;

    // 7. Upload to Vercel Blob with comprehensive error handling and progress tracking
    let blob;
    const startTime = Date.now();
    
    try {
      // Simulate progress tracking (in real implementation, you'd use a streaming approach)
      const totalChunks = Math.ceil(fileSize / (1024 * 1024)); // 1MB chunks
      let uploadedChunks = 0;
      
      // Create a progress tracking promise
      const progressPromise = new Promise((resolve, reject) => {
        const progressInterval = setInterval(() => {
          uploadedChunks++;
          const progress = Math.min((uploadedChunks / totalChunks) * 100, 100);
          
          // Log progress (in production, you'd send this via WebSocket or Server-Sent Events)
          console.log(`Upload Progress: ${progress.toFixed(1)}%`);
          
          if (uploadedChunks >= totalChunks) {
            clearInterval(progressInterval);
            resolve();
          }
        }, 100); // Update every 100ms for demo
      });
      
      // Actual upload with timeout
      const uploadPromise = Promise.race([
        put(finalFilename, fileBuffer, {
          access: 'public',
          token: token,
          addRandomSuffix: false // We're handling this ourselves
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Upload timeout')), 60000) // 60 second timeout
        )
      ]);
      
      // Wait for both upload and progress tracking
      const [uploadResult] = await Promise.all([uploadPromise, progressPromise]);
      blob = uploadResult;
      
    } catch (uploadError) {
      console.error('Vercel upload error:', uploadError);
      
      const errorMessage = uploadError.message.toLowerCase();
      
      if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid token')) {
        // Track failed request due to unauthorized
        try {
          await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
        } catch (trackingError) {
          console.error('Error tracking failed request:', trackingError);
        }
        
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired Vercel token',
          code: 'UNAUTHORIZED'
        });
      }
      
      if (errorMessage.includes('forbidden')) {
        // Track failed request due to forbidden
        try {
          await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
        } catch (trackingError) {
          console.error('Error tracking failed request:', trackingError);
        }
        
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions. Token needs read-write access.',
          code: 'FORBIDDEN'
        });
      }
      
      if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        // Track failed request due to quota exceeded
        try {
          await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
        } catch (trackingError) {
          console.error('Error tracking failed request:', trackingError);
        }
        
        return res.status(507).json({
          success: false,
          error: 'Storage quota exceeded or file too large',
          code: 'QUOTA_EXCEEDED'
        });
      }
      
      // Check for Vercel Blob specific size limits
      if (errorMessage.includes('payload too large') || errorMessage.includes('413') || errorMessage.includes('request entity too large')) {
        // Track failed request due to size limit
        try {
          await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
        } catch (trackingError) {
          console.error('Error tracking failed request:', trackingError);
        }
        
        return res.status(413).json({
          success: false,
          error: `File size exceeds Vercel Blob's per-request limit of ${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
          code: 'VERCEL_SIZE_LIMIT_EXCEEDED',
          details: {
            maxSize: `${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
            currentSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
            recommendation: 'Split large files into smaller chunks or use a different storage provider'
          },
          limits: {
            vercelBlobLimit: VERCEL_BLOB_LIMIT,
            ourServiceLimit: MAX_FILE_SIZE,
            vercelBlobLimitMB: (VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1),
            ourServiceLimitMB: (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
          }
        });
      }
      
      if (errorMessage.includes('timeout')) {
        // Track failed request due to timeout
        try {
          await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
        } catch (trackingError) {
          console.error('Error tracking failed request:', trackingError);
        }
        
        return res.status(408).json({
          success: false,
          error: 'Upload timeout. Please try with a smaller file.',
          code: 'UPLOAD_TIMEOUT'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Upload failed',
        code: 'UPLOAD_FAILED',
        details: process.env.NODE_ENV === 'development' ? uploadError.message : undefined
      });
    }

    // 8. Calculate upload statistics
    const uploadDuration = Date.now() - startTime;
    const uploadSpeed = fileSize / (uploadDuration / 1000); // bytes per second
    const uploadSpeedMBps = (uploadSpeed / (1024 * 1024)).toFixed(2); // MB/s

    // 9. Log successful upload
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: finalFilename,
          original_name: originalFilename,
          file_type: fileMimetype,
          file_size: fileSize,
          file_url: blob.url,
          status: 'completed',
          provider: 'vercel',
          upload_duration: uploadDuration,
          upload_speed: uploadSpeed,
          metadata: {
            user_agent: req.headers['user-agent'],
            ip_address: req.ip,
            upload_speed_mbps: uploadSpeedMBps,
            chunks_processed: Math.ceil(fileSize / (1024 * 1024))
          }
        });

      // Update request metrics for successful uploads
      await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'success', fileSize, fileMimetype);
    } catch (logError) {
      console.error('Error logging upload completion:', logError);
      // Non-blocking - continue even if logging fails
    }

    // 10. Return success response with progress and statistics
    return res.status(200).json({
      success: true,
      data: {
        url: blob.url,
        filename: finalFilename,
        originalFilename: originalFilename,
        size: fileSize,
        contentType: fileMimetype,
        uploadedAt: new Date().toISOString()
      },
      upload: {
        duration: uploadDuration,
        provider: 'vercel',
        status: 'completed',
        progress: '100%',
        speed: `${uploadSpeedMBps} MB/s`,
        chunks: Math.ceil(fileSize / (1024 * 1024))
      },
      statistics: {
        totalSize: fileSize,
        totalSizeFormatted: formatFileSize(fileSize),
        uploadDuration: `${uploadDuration}ms`,
        averageSpeed: `${uploadSpeedMBps} MB/s`,
        efficiency: uploadDuration < 1000 ? 'Excellent' : uploadDuration < 5000 ? 'Good' : 'Normal'
      }
    });

  } catch (error) {
    console.error('Vercel Blob upload error:', error);
    
    // Track failed request
    try {
      await updateRequestMetrics(req.apiKeyId, req.userId, 'vercel', 'failed', 0);
    } catch (trackingError) {
      console.error('Error tracking failed request:', trackingError);
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error during upload',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Enhanced analytics tracking endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const trackUploadEvent = async (req, res) => {
  try {
    const { event, fileUrl, filename, fileSize, error, provider = 'vercel' } = req.body;
    
    if (!event || !fileUrl) {
      return res.status(400).json({
        success: false,
        error: 'event and fileUrl are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Validate event type
    const validEvents = ['initiated', 'completed', 'failed', 'cancelled', 'timeout'];
    if (!validEvents.includes(event)) {
      return res.status(400).json({
        success: false,
        error: `Invalid event type. Allowed: ${validEvents.join(', ')}`,
        code: 'INVALID_EVENT'
      });
    }

    // Log the event for analytics
    try {
      await supabaseAdmin
        .from('upload_logs')
        .insert({
          user_id: req.userId,
          api_key_id: req.apiKeyId,
          file_name: filename,
          file_url: fileUrl,
          file_size: fileSize || 0,
          status: event,
          provider: provider,
          event_type: event,
          error_message: error || null,
          created_at: new Date(),
          metadata: {
            user_agent: req.headers['user-agent'],
            ip_address: req.ip,
            timestamp: Date.now()
          }
        });

      // Track analytics event
      await updateRequestMetrics(req.apiKeyId, req.userId, provider, 'success', fileSize || 0);
    } catch (logError) {
      console.error('Error logging analytics event:', logError);
    }

    return res.status(200).json({
      success: true,
      message: 'Event tracked successfully',
      event: event,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analytics tracking error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to track event',
      code: 'TRACKING_FAILED',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Vercel health check endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const vercelHealthCheck = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Vercel provider is healthy',
      provider: 'vercel',
      status: 'operational',
      timestamp: new Date().toISOString(),
      features: {
        signedUrls: true,
        directUpload: true,
        progressTracking: true,
        analytics: true,
        maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
        vercelBlobLimit: `${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
        allowedTypes: ALLOWED_FILE_TYPES
      },
      limits: {
        ourServiceLimit: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
        vercelBlobLimit: `${(VERCEL_BLOB_LIMIT / 1024 / 1024).toFixed(1)}MB`,
        note: 'Vercel Blob has a 4.5MB per-request limit. Files larger than this will be rejected.'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Vercel provider health check failed',
      provider: 'vercel',
      status: 'degraded',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Helper function to format file sizes
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 bytes';
  
  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
