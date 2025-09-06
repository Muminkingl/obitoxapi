import { supabaseAdmin } from '../../database/supabase.js';

// Configuration constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (our service limit)
const UPLOADCARE_API_BASE = 'https://api.uploadcare.com';
const UPLOADCARE_CDN_BASE = 'https://ucarecdn.com';

// Allowed file types for Uploadcare
const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
  'application/pdf', 'text/plain', 'application/json', 'text/csv',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mpeg',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

/**
 * Log individual file upload to granular tracking tables
 */
const logFileUpload = async (apiKeyId, userId, provider, fileName, fileType, fileSize, uploadStatus, fileUrl = null, errorMessage = null) => {
  try {
    // Insert into file_uploads table
    await supabaseAdmin
      .from('file_uploads')
      .insert({
        api_key_id: apiKeyId,
        user_id: userId,
        provider: provider,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        upload_status: uploadStatus,
        file_url: fileUrl,
        error_message: errorMessage,
        uploaded_at: new Date().toISOString()
      });

    // Insert into api_requests table
    await supabaseAdmin
      .from('api_requests')
      .insert({
        api_key_id: apiKeyId,
        user_id: userId,
        request_type: 'upload',
        provider: provider,
        status_code: uploadStatus === 'success' ? 200 : 400,
        request_size_bytes: fileSize,
        response_size_bytes: uploadStatus === 'success' ? fileSize : 0,
        error_message: errorMessage,
        requested_at: new Date().toISOString()
      });

  } catch (error) {
    // Non-blocking - don't fail the main operation if logging fails
  }
};

/**
 * Update file size for Uploadcare after getting file info
 */
const updateUploadcareFileSize = async (apiKeyId, fileUuid, uploadcarePublicKey, uploadcareSecretKey) => {
  try {
    // Get file info from Uploadcare to get the actual file size
    const fileInfoResponse = await fetch(`https://api.uploadcare.com/files/${fileUuid}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      }
    });

    if (fileInfoResponse.ok) {
      const fileInfo = await fileInfoResponse.json();
      const fileSize = fileInfo.size || 0;
      
      // Update provider usage with actual file size
      const { data: existingUsage, error: usageError } = await supabaseAdmin
        .from('provider_usage')
        .select('upload_count, total_file_size')
        .eq('api_key_id', apiKeyId)
        .eq('provider', 'uploadcare')
        .single();
      
      if (!usageError && existingUsage) {
        const currentSize = existingUsage.total_file_size || 0;
        const currentUploads = existingUsage.upload_count || 0;
        
        // Update with actual file size
        await supabaseAdmin
          .from('provider_usage')
          .update({
            total_file_size: currentSize + fileSize,
            average_file_size: Math.round((currentSize + fileSize) / (currentUploads + 1)),
            updated_at: new Date().toISOString()
          })
          .eq('api_key_id', apiKeyId)
          .eq('provider', 'uploadcare');
        
      }
    }
  } catch (error) {
  }
};

/**
 * Update request metrics for Uploadcare
 */
const updateUploadcareMetrics = async (apiKeyId, userId, provider, status, fileSize = 0, fileType = null) => {
  try {
    // Get current values to increment them
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('api_keys')
      .select('total_requests, successful_requests, failed_requests')
      .eq('id', apiKeyId)
      .single();
    
    if (fetchError) {
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

    // Update provider usage
    if (status === 'success' && provider) {
      const { data: existingUsage, error: usageError } = await supabaseAdmin
        .from('provider_usage')
        .select('upload_count, total_file_size')
        .eq('api_key_id', apiKeyId)
        .eq('provider', provider.toLowerCase())
        .single();
      
      if (usageError && usageError.code !== 'PGRST116') {
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
    // Non-blocking - continue even if metrics update fails
  }
};

/**
 * Comprehensive file validation for Uploadcare
 */
const validateFileForUploadcare = (filename, contentType, fileSize = 0) => {
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
  
  // File size validation
  if (fileSize > MAX_FILE_SIZE) {
    errors.push(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Generate a secure unique filename for Uploadcare
 */
const generateUploadcareFilename = (originalName, apiKey = null) => {
  try {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop()?.toLowerCase() || 'bin';
    
    // Sanitize original name
    const baseName = originalName
      .split('.')[0]
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50); // Limit base name length

    // Add API key prefix for organization (first 8 chars)
    const keyPrefix = apiKey ? apiKey.substring(0, 8) : 'unknown';
    
    return `${keyPrefix}_${baseName}_${timestamp}_${randomSuffix}.${extension}`;
  } catch (error) {
    const timestamp = Date.now();
    return `file_${timestamp}.bin`;
  }
};

/**
 * Generate signed upload URL for Uploadcare (zero bandwidth cost)
 */
export const generateUploadcareSignedUrl = async (req, res) => {
  try {
    
    const { filename, contentType, fileSize, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    // Validate required fields
    if (!filename || !contentType) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'filename and contentType are required'
      });
    }

    // File validation
    const fileValidation = validateFileForUploadcare(filename, contentType, fileSize);
    if (!fileValidation.isValid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'File validation failed',
        details: fileValidation.errors
      });
    }

    // Generate unique filename
    const uniqueFilename = generateUploadcareFilename(filename, apiKeyId);

    // For Uploadcare, we don't generate signed URLs like other providers
    // Instead, we return the direct upload URL and parameters for the client to upload directly
    const uploadUrl = 'https://upload.uploadcare.com/base/';
    
    // Generate a temporary UUID for the file (Uploadcare will assign the real one)
    const tempUuid = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    // Return upload URL response
    res.status(200).json({
      success: true,
      message: 'Uploadcare upload URL generated successfully',
      data: {
        uploadUrl: uploadUrl,
        fileUrl: '', // Will be set after upload
        filename: uniqueFilename,
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        formData: {
          UPLOADCARE_PUB_KEY: uploadcarePublicKey,
          UPLOADCARE_STORE: 'auto',
          file: '[FILE_DATA]'
        },
        uuid: tempUuid,
        provider: 'uploadcare'
      },
      upload: {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during signed URL generation',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Delete file from Uploadcare using their REST API
 */
export const deleteUploadcareFile = async (req, res) => {
  try {
    
    const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!fileUrl && !uuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or uuid is required'
      });
    }

    let fileUuid = uuid;

    // Extract UUID from URL if not provided directly
    if (!fileUuid && fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        fileUuid = pathParts[1]; // UUID is the first path segment after domain
      } catch (error) {
        await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!fileUuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'INVALID_UUID',
        message: 'Could not determine file UUID'
      });
    }


    // Delete from Uploadcare using their REST API
    const deleteResponse = await fetch(`${UPLOADCARE_API_BASE}/files/${fileUuid}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      
      let errorType = 'DELETE_ERROR';
      let statusCode = 500;
      
      if (deleteResponse.status === 404) {
        errorType = 'FILE_NOT_FOUND';
        statusCode = 404;
      } else if (deleteResponse.status === 403) {
        errorType = 'DELETE_PERMISSION_DENIED';
        statusCode = 403;
      }

      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(statusCode).json({
        success: false,
        error: errorType,
        message: 'Failed to delete file from Uploadcare',
        details: errorText
      });
    }


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    // Remove from upload logs
    await supabaseAdmin
      .from('upload_logs')
      .delete()
      .eq('file_url', fileUrl || `${UPLOADCARE_CDN_BASE}/${fileUuid}/`)
      .eq('api_key_id', apiKeyId);

    res.status(200).json({
      success: true,
      message: 'File deleted from Uploadcare successfully',
      data: {
        uuid: fileUuid,
        deletedAt: new Date().toISOString(),
        provider: 'uploadcare'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file deletion',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Download file from Uploadcare (get file info and public URL)
 */
export const downloadUploadcareFile = async (req, res) => {
  try {
    
    const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!fileUrl && !uuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or uuid is required'
      });
    }

    let fileUuid = uuid;

    // Extract UUID from URL if not provided directly
    if (!fileUuid && fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        fileUuid = pathParts[1]; // UUID is the first path segment after domain
      } catch (error) {
        await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!fileUuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'INVALID_UUID',
        message: 'Could not determine file UUID'
      });
    }


    // Get file info from Uploadcare using their REST API
    const fileInfoResponse = await fetch(`${UPLOADCARE_API_BASE}/files/${fileUuid}/`, {
      method: 'GET',
      headers: {
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!fileInfoResponse.ok) {
      const errorText = await fileInfoResponse.text();
      
      let errorType = 'FILE_INFO_ERROR';
      let statusCode = 500;
      
      if (fileInfoResponse.status === 404) {
        errorType = 'FILE_NOT_FOUND';
        statusCode = 404;
      } else if (fileInfoResponse.status === 403) {
        errorType = 'ACCESS_DENIED';
        statusCode = 403;
      }

      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(statusCode).json({
        success: false,
        error: errorType,
        message: 'Failed to get file info from Uploadcare',
        details: errorText
      });
    }

    const fileInfo = await fileInfoResponse.json();
    
    // Use the actual CDN URL from the API response instead of constructing it
    const publicUrl = fileInfo.original_file_url || `${UPLOADCARE_CDN_BASE}/${fileUuid}/`;


    // Update file size with actual data from Uploadcare
    await updateUploadcareFileSize(apiKeyId, fileUuid, uploadcarePublicKey, uploadcareSecretKey);

    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    // Log to granular tracking tables (this represents when we first access the file)
    await logFileUpload(
      apiKeyId,
      userId,
      'uploadcare',
      fileInfo.original_filename,
      fileInfo.mime_type,
      fileInfo.size,
      'success',
      publicUrl
    );

    res.status(200).json({
      success: true,
      message: 'File download info retrieved successfully',
      data: {
        downloadUrl: publicUrl,
        fileSize: fileInfo.size,
        contentType: fileInfo.mime_type,
        filename: fileInfo.original_filename,
        uuid: fileUuid,
        isPrivate: false, // Uploadcare files are public by default
        provider: 'uploadcare',
        metadata: {
          originalFilename: fileInfo.original_filename,
          mimeType: fileInfo.mime_type,
          size: fileInfo.size,
          uploadDate: fileInfo.datetime_uploaded,
          lastModified: fileInfo.datetime_stored,
          isImage: fileInfo.is_image,
          isReady: fileInfo.is_ready,
          originalFileUrl: fileInfo.original_file_url
        }
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file download',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Cancel upload (not applicable for Uploadcare as uploads are immediate)
 */
export const cancelUploadcareUpload = async (req, res) => {
  try {
    
    const { uploadId } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Uploadcare uploads are immediate, so cancellation is not applicable

    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Upload cancellation not applicable for Uploadcare',
      data: {
        reason: 'Uploadcare uploads are immediate and cannot be cancelled',
        uploadId: uploadId,
        provider: 'uploadcare'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during upload cancellation',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * List files from Uploadcare
 */
export const listUploadcareFiles = async (req, res) => {
  try {
    
    const { uploadcarePublicKey, uploadcareSecretKey, limit = 100, offset = 0 } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }


    // List files from Uploadcare using their REST API
    const listResponse = await fetch(`${UPLOADCARE_API_BASE}/files/?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(listResponse.status).json({
        success: false,
        error: 'LIST_FILES_ERROR',
        message: 'Failed to list files from Uploadcare',
        details: errorText
      });
    }

    const listResult = await listResponse.json();
    const files = listResult.results || [];


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Files listed successfully',
      data: {
        files: files.map(file => ({
          uuid: file.uuid,
          filename: file.original_filename,
          size: file.size,
          contentType: file.mime_type,
          url: `${UPLOADCARE_CDN_BASE}/${file.uuid}/`,
          uploadDate: file.datetime_uploaded,
          lastModified: file.datetime_stored,
          isImage: file.is_image,
          isReady: file.is_ready,
          provider: 'uploadcare'
        })),
        total: listResult.total || files.length,
        limit: limit,
        offset: offset,
        provider: 'uploadcare'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file listing',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Scan file for malware using Uploadcare's ClamAV integration
 */
export const scanUploadcareFileForMalware = async (req, res) => {
  try {
    
    const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!fileUrl && !uuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or uuid is required'
      });
    }

    let fileUuid = uuid;

    // Extract UUID from URL if not provided directly
    if (!fileUuid && fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        fileUuid = pathParts[1]; // UUID is the first path segment after domain
      } catch (error) {
        await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!fileUuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'INVALID_UUID',
        message: 'Could not determine file UUID'
      });
    }


    // Execute virus scan using Uploadcare's ClamAV addon
    const scanResponse = await fetch('https://api.uploadcare.com/addons/uc_clamav_virus_scan/execute/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      },
      body: JSON.stringify({
        target: fileUuid
      })
    });

    if (!scanResponse.ok) {
      const errorText = await scanResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(scanResponse.status).json({
        success: false,
        error: 'SCAN_INITIATION_FAILED',
        message: 'Failed to initiate malware scan',
        details: errorText
      });
    }

    const scanResult = await scanResponse.json();
    const requestId = scanResult.request_id;


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Malware scan initiated successfully',
      data: {
        requestId: requestId,
        uuid: fileUuid,
        status: 'scanning',
        provider: 'uploadcare',
        scanType: 'clamav'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during malware scan',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Check malware scan status
 */
export const checkUploadcareMalwareScanStatus = async (req, res) => {
  try {
    
    const { requestId, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!requestId) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUEST_ID',
        message: 'Request ID is required'
      });
    }


    // Check scan status
    const statusResponse = await fetch(`https://api.uploadcare.com/addons/uc_clamav_virus_scan/execute/status/?request_id=${requestId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      }
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(statusResponse.status).json({
        success: false,
        error: 'STATUS_CHECK_FAILED',
        message: 'Failed to check malware scan status',
        details: errorText
      });
    }

    const statusResult = await statusResponse.json();
    const status = statusResult.status;


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Malware scan status retrieved successfully',
      data: {
        requestId: requestId,
        status: status,
        isComplete: status === 'done',
        provider: 'uploadcare',
        scanType: 'clamav'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during status check',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get malware scan results
 */
export const getUploadcareMalwareScanResults = async (req, res) => {
  try {
    
    const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!fileUrl && !uuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or uuid is required'
      });
    }

    let fileUuid = uuid;

    // Extract UUID from URL if not provided directly
    if (!fileUuid && fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        fileUuid = pathParts[1]; // UUID is the first path segment after domain
      } catch (error) {
        await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!fileUuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'INVALID_UUID',
        message: 'Could not determine file UUID'
      });
    }


    // Get file info with appdata to check malware scan results
    const fileInfoResponse = await fetch(`https://api.uploadcare.com/files/${fileUuid}/?include=appdata`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      }
    });

    if (!fileInfoResponse.ok) {
      const errorText = await fileInfoResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(fileInfoResponse.status).json({
        success: false,
        error: 'FILE_INFO_ERROR',
        message: 'Failed to get file information',
        details: errorText
      });
    }

    const fileInfo = await fileInfoResponse.json();
    const malwareData = fileInfo.appdata?.uc_clamav_virus_scan;


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Malware scan results retrieved successfully',
      data: {
        uuid: fileUuid,
        hasScanResults: !!malwareData,
        isInfected: malwareData?.data?.infected || false,
        infectedWith: malwareData?.data?.infected_with || null,
        scanDate: malwareData?.datetime_created || null,
        lastUpdated: malwareData?.datetime_updated || null,
        scanVersion: malwareData?.version || null,
        provider: 'uploadcare',
        scanType: 'clamav',
        rawData: malwareData || null
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during results retrieval',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Remove infected file
 */
export const removeUploadcareInfectedFile = async (req, res) => {
  try {
    
    const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!fileUrl && !uuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or uuid is required'
      });
    }

    let fileUuid = uuid;

    // Extract UUID from URL if not provided directly
    if (!fileUuid && fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        fileUuid = pathParts[1]; // UUID is the first path segment after domain
      } catch (error) {
        await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!fileUuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'INVALID_UUID',
        message: 'Could not determine file UUID'
      });
    }


    // Execute virus scan with purge_infected parameter
    const purgeResponse = await fetch('https://api.uploadcare.com/addons/uc_clamav_virus_scan/execute/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      },
      body: JSON.stringify({
        target: fileUuid,
        params: {
          purge_infected: true
        }
      })
    });

    if (!purgeResponse.ok) {
      const errorText = await purgeResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(purgeResponse.status).json({
        success: false,
        error: 'PURGE_FAILED',
        message: 'Failed to remove infected file',
        details: errorText
      });
    }

    const purgeResult = await purgeResponse.json();
    const requestId = purgeResult.request_id;


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Infected file removal initiated successfully',
      data: {
        requestId: requestId,
        uuid: fileUuid,
        status: 'removing',
        provider: 'uploadcare',
        scanType: 'clamav'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during infected file removal',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Validate file before upload (Uploadcare validation)
 */
export const validateUploadcareFile = async (req, res) => {
  try {
    
    const { 
      filename, 
      contentType, 
      fileSize, 
      uploadcarePublicKey, 
      uploadcareSecretKey,
      maxFileSize,
      allowedMimeTypes,
      blockMimeTypes,
      enableSvgValidation
    } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!filename || !contentType || !fileSize) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'filename, contentType, and fileSize are required'
      });
    }


    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      fileInfo: {
        filename,
        contentType,
        fileSize,
        extension: filename.split('.').pop()?.toLowerCase() || ''
      }
    };

    // 1. File size validation
    const maxSize = maxFileSize || 5242880 * 1024 * 1024; // Default 5TB in bytes
    if (fileSize > maxSize) {
      validationResults.isValid = false;
      validationResults.errors.push(`File size (${fileSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`);
    }

    // 2. MIME type validation
    if (allowedMimeTypes && allowedMimeTypes.length > 0) {
      if (!allowedMimeTypes.includes(contentType)) {
        validationResults.isValid = false;
        validationResults.errors.push(`MIME type '${contentType}' is not in the allowed list: ${allowedMimeTypes.join(', ')}`);
      }
    }

    if (blockMimeTypes && blockMimeTypes.length > 0) {
      if (blockMimeTypes.includes(contentType)) {
        validationResults.isValid = false;
        validationResults.errors.push(`MIME type '${contentType}' is in the blocked list: ${blockMimeTypes.join(', ')}`);
      }
    }

    // 3. SVG validation (if enabled)
    if (enableSvgValidation && contentType === 'image/svg+xml') {
      validationResults.warnings.push('SVG validation is enabled - file will be checked for JavaScript content after upload');
    }

    // 4. Filename validation
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(filename)) {
      validationResults.isValid = false;
      validationResults.errors.push('Filename contains invalid characters');
    }

    // 5. Extension validation
    const dangerousExtensions = ['exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar'];
    if (dangerousExtensions.includes(validationResults.fileInfo.extension)) {
      validationResults.warnings.push(`File extension '${validationResults.fileInfo.extension}' may be potentially dangerous`);
    }


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'File validation completed',
      data: {
        ...validationResults,
        provider: 'uploadcare',
        validationType: 'pre-upload'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file validation',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get Uploadcare project settings for validation
 */
export const getUploadcareProjectSettings = async (req, res) => {
  try {
    
    const { uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }


    // Get project settings from Uploadcare API
    const settingsResponse = await fetch('https://api.uploadcare.com/project/', {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      }
    });

    if (!settingsResponse.ok) {
      const errorText = await settingsResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(settingsResponse.status).json({
        success: false,
        error: 'SETTINGS_RETRIEVAL_FAILED',
        message: 'Failed to retrieve project settings',
        details: errorText
      });
    }

    const projectSettings = await settingsResponse.json();


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'Project settings retrieved successfully',
      data: {
        projectSettings,
        provider: 'uploadcare',
        settingsType: 'project-configuration'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during settings retrieval',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Validate SVG file for JavaScript content
 */
export const validateUploadcareSvg = async (req, res) => {
  try {
    
    const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
    const apiKeyId = req.apiKeyId;
    const userId = req.userId;

    if (!apiKeyId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Validate developer's Uploadcare credentials
    if (!uploadcarePublicKey || !uploadcareSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_UPLOADCARE_CREDENTIALS',
        message: 'Uploadcare public key and secret key are required. Please provide your Uploadcare credentials.'
      });
    }

    if (!fileUrl && !uuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or uuid is required'
      });
    }

    let fileUuid = uuid;

    // Extract UUID from URL if not provided directly
    if (!fileUuid && fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        fileUuid = pathParts[1]; // UUID is the first path segment after domain
      } catch (error) {
        await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!fileUuid) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'INVALID_UUID',
        message: 'Could not determine file UUID'
      });
    }


    // Get file info to check if it's an SVG
    const fileInfoResponse = await fetch(`https://api.uploadcare.com/files/${fileUuid}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Authorization': `Uploadcare.Simple ${uploadcarePublicKey}:${uploadcareSecretKey}`
      }
    });

    if (!fileInfoResponse.ok) {
      const errorText = await fileInfoResponse.text();
      
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      
      return res.status(fileInfoResponse.status).json({
        success: false,
        error: 'FILE_INFO_ERROR',
        message: 'Failed to get file information',
        details: errorText
      });
    }

    const fileInfo = await fileInfoResponse.json();

    // Check if file is SVG
    if (fileInfo.mime_type !== 'image/svg+xml') {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'NOT_SVG_FILE',
        message: 'File is not an SVG file'
      });
    }

    // Download file content to check for JavaScript
    const fileContentResponse = await fetch(fileInfo.original_file_url);
    if (!fileContentResponse.ok) {
      await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0);
      return res.status(400).json({
        success: false,
        error: 'FILE_DOWNLOAD_ERROR',
        message: 'Failed to download file content for validation'
      });
    }

    const fileContent = await fileContentResponse.text();

    // Check for JavaScript patterns in SVG
    const jsPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi
    ];

    const validationResults = {
      isValid: true,
      hasJavaScript: false,
      detectedPatterns: [],
      securityRisk: false
    };

    for (const pattern of jsPatterns) {
      const matches = fileContent.match(pattern);
      if (matches) {
        validationResults.hasJavaScript = true;
        validationResults.isValid = false;
        validationResults.securityRisk = true;
        validationResults.detectedPatterns.push(...matches);
      }
    }


    // Update metrics
    await updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0);

    res.status(200).json({
      success: true,
      message: 'SVG validation completed',
      data: {
        uuid: fileUuid,
        ...validationResults,
        provider: 'uploadcare',
        validationType: 'svg-security'
      }
    });

  } catch (error) {
    
    if (req.apiKeyId) {
      await updateUploadcareMetrics(req.apiKeyId, req.userId, 'uploadcare', 'failed', 0);
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during SVG validation',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Uploadcare health check endpoint
 */
export const uploadcareHealthCheck = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Uploadcare provider is healthy',
      provider: 'uploadcare',
      status: 'operational',
      timestamp: new Date().toISOString(),
      features: {
        upload: true,
        download: true,
        delete: true,
        list: true,
        cancel: false, // Uploadcare uploads are immediate
        imageTransformations: true,
        cdnDelivery: true,
        maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
        allowedTypes: ALLOWED_FILE_TYPES,
        rateLimit: '100 uploads per minute'
      },
      limits: {
        maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
        note: 'Uploadcare supports various file types with on-the-fly image processing'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Uploadcare provider health check failed',
      provider: 'uploadcare',
      status: 'degraded',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};