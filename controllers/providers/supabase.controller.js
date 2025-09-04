import { supabaseAdmin, supabaseClient } from '../../config/supabase.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Update request metrics for Supabase Storage
 */
const updateSupabaseMetrics = async (apiKey, provider, success, errorType = null, additionalData = {}) => {
  try {
    if (!apiKey) {
      console.warn('⚠️ No API key provided for metrics update');
      return;
    }

    // Get current values to increment them
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('api_keys')
      .select('total_requests, successful_requests, failed_requests, rate_limit_count, quota_used')
      .eq('id', apiKey)
      .single();
    
    if (fetchError) {
      console.error('Error fetching current metrics:', fetchError);
      return;
    }
    
    const currentTotal = currentData?.total_requests || 0;
    const currentSuccess = currentData?.successful_requests || 0;
    const currentFailed = currentData?.failed_requests || 0;
    const currentRateLimit = currentData?.rate_limit_count || 0;
    const currentQuota = currentData?.quota_used || 0;
    
    // Calculate new quota usage based on file size
    const fileSizeInMB = (additionalData.fileSize || 0) / (1024 * 1024);
    const newQuotaUsed = success ? currentQuota + fileSizeInMB : currentQuota;
    
    // Update main api_keys table metrics
    const updateData = {
      total_requests: currentTotal + 1,
      successful_requests: success ? currentSuccess + 1 : currentSuccess,
      failed_requests: success ? currentFailed : currentFailed + 1,
      last_request_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      quota_used: newQuotaUsed
    };

    // Handle rate limiting
    if (errorType === 'RATE_LIMIT') {
      updateData.rate_limit_count = currentRateLimit + 1;
    }

    await supabaseAdmin
      .from('api_keys')
      .update(updateData)
      .eq('id', apiKey);

    // Update provider usage
    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('provider_usage')
      .select('upload_count, total_size, last_upload_at')
      .eq('api_key_id', apiKey)
      .eq('provider', provider)
      .single();

    if (providerError && providerError.code !== 'PGRST116') {
      console.error('Error fetching provider metrics:', providerError);
    } else {
      const currentCount = providerData?.upload_count || 0;
      const currentSize = providerData?.total_size || 0;
      
      if (providerError?.code === 'PGRST116') {
        // Insert new record
        await supabaseAdmin
          .from('provider_usage')
          .insert({
            api_key_id: apiKey,
            provider: provider,
            upload_count: success ? 1 : 0,
            total_size: success ? fileSizeInMB : 0,
            last_upload_at: success ? new Date().toISOString() : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      } else {
        // Update existing record
        const updateProviderData = {
          upload_count: success ? currentCount + 1 : currentCount,
          total_size: success ? currentSize + fileSizeInMB : currentSize,
          updated_at: new Date().toISOString()
        };

        if (success) {
          updateProviderData.last_upload_at = new Date().toISOString();
        }

        await supabaseAdmin
          .from('provider_usage')
          .update(updateProviderData)
          .eq('api_key_id', apiKey)
          .eq('provider', provider);
      }
    }

    // Log error details for analytics
    if (!success && errorType) {
      await supabaseAdmin
        .from('error_logs')
        .insert({
          api_key_id: apiKey,
          provider: provider,
          error_type: errorType,
          error_details: additionalData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    console.log(`📊 Metrics updated for ${provider}: ${success ? 'SUCCESS' : 'FAILED'} - ${errorType || 'N/A'}`);
  } catch (error) {
    console.error('Error updating metrics:', error);
  }
};

// Enhanced Supabase Storage configuration
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'test';
const PRIVATE_BUCKET = process.env.SUPABASE_PRIVATE_BUCKET || 'private';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 50MB default
const MIN_FILE_SIZE = 1; // 1 byte minimum
const MAX_FILES_PER_USER = parseInt(process.env.MAX_FILES_PER_USER) || 1000;
const MAX_TOTAL_SIZE_PER_USER = parseInt(process.env.MAX_TOTAL_SIZE_PER_USER) || 1024 * 1024 * 1024; // 1GB
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 60;
const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR) || 1000;

// Enhanced allowed file types with security considerations
const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
  // Documents
  'application/pdf', 'text/plain', 'application/json', 'text/csv', 'application/xml', 'text/xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Media
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
  'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/mpeg',
  // Archives
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/x-tar',
  // Code files
  'text/javascript', 'text/css', 'text/html', 'application/javascript'
];

// Dangerous file types that should never be allowed
const DANGEROUS_FILE_TYPES = [
  'application/x-executable', 'application/x-dosexec', 'application/x-msdownload',
  'application/x-shockwave-flash', 'text/x-script', 'application/x-shellscript'
];

// File size limits per type (in bytes)
const FILE_TYPE_LIMITS = {
  'image/': 20 * 1024 * 1024, // 20MB for images
  'video/': 500 * 1024 * 1024, // 500MB for videos
  'audio/': 100 * 1024 * 1024, // 100MB for audio
  'application/pdf': 50 * 1024 * 1024, // 50MB for PDFs
  'default': 25 * 1024 * 1024 // 25MB for everything else
};

/**
 * Check if bucket exists and user has access
 */
const checkBucketAccess = async (bucketName, apiKey, operation = 'read', developerSupabase = null) => {
  try {
    // Use developer's Supabase client if provided, otherwise fall back to admin client
    const supabaseClient = developerSupabase || supabaseAdmin;
    
    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabaseClient.storage.listBuckets();
    
    if (bucketsError) {
      return { hasAccess: false, error: 'BUCKET_LIST_ERROR', details: bucketsError.message };
    }
    
    const bucket = buckets.find(b => b.name === bucketName);
    if (!bucket) {
      return { hasAccess: false, error: 'BUCKET_NOT_FOUND', details: `Bucket '${bucketName}' does not exist` };
    }

    // For developer's Supabase client, we assume they have access to their own buckets
    if (developerSupabase) {
      // Check if bucket has size restrictions
      if (bucket.file_size_limit && operation === 'write') {
        return { 
          hasAccess: true, 
          bucket: bucket, 
          fileSizeLimit: bucket.file_size_limit,
          isPublic: bucket.public
        };
      }

      return { hasAccess: true, bucket: bucket, isPublic: bucket.public };
    }

    // Check bucket policies and restrictions (only for admin client)
    if (bucket.public === false && operation === 'read') {
      // For private buckets, check if user has specific access
      const { data: permissions, error: permError } = await supabaseAdmin
        .from('bucket_permissions')
        .select('*')
        .eq('bucket_name', bucketName)
        .eq('api_key_id', apiKey)
        .single();

      if (permError && permError.code === 'PGRST116') {
        return { hasAccess: false, error: 'BUCKET_ACCESS_DENIED', details: 'No permission for private bucket' };
      }

      if (permError) {
        return { hasAccess: false, error: 'PERMISSION_CHECK_ERROR', details: permError.message };
      }

      if (!permissions || !permissions.can_read) {
        return { hasAccess: false, error: 'BUCKET_READ_DENIED', details: 'Read access denied for this bucket' };
      }
    }

    // Check if bucket has size restrictions
    if (bucket.file_size_limit && operation === 'write') {
      return { 
        hasAccess: true, 
        bucket: bucket, 
        fileSizeLimit: bucket.file_size_limit,
        isPublic: bucket.public
      };
    }

    return { hasAccess: true, bucket: bucket, isPublic: bucket.public };
  } catch (error) {
    return { hasAccess: false, error: 'BUCKET_CHECK_ERROR', details: error.message };
  }
};

/**
 * Check rate limiting
 */
const checkRateLimit = async (apiKey) => {
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check requests in the last minute
    const { data: minuteRequests, error: minuteError } = await supabaseAdmin
      .from('request_logs')
      .select('id')
      .eq('api_key_id', apiKey)
      .gte('created_at', oneMinuteAgo.toISOString())
      .limit(RATE_LIMIT_PER_MINUTE + 1);

    if (minuteError) {
      console.error('Rate limit check error (minute):', minuteError);
      return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE };
    }

    if (minuteRequests && minuteRequests.length >= RATE_LIMIT_PER_MINUTE) {
      return { 
        allowed: false, 
        remaining: 0, 
        resetTime: new Date(now.getTime() + 60 * 1000),
        error: 'RATE_LIMIT_MINUTE'
      };
    }

    // Check requests in the last hour
    const { data: hourRequests, error: hourError } = await supabaseAdmin
      .from('request_logs')
      .select('id')
      .eq('api_key_id', apiKey)
      .gte('created_at', oneHourAgo.toISOString())
      .limit(RATE_LIMIT_PER_HOUR + 1);

    if (hourError) {
      console.error('Rate limit check error (hour):', hourError);
      return { allowed: true, remaining: RATE_LIMIT_PER_HOUR };
    }

    if (hourRequests && hourRequests.length >= RATE_LIMIT_PER_HOUR) {
      return { 
        allowed: false, 
        remaining: 0, 
        resetTime: new Date(now.getTime() + 60 * 60 * 1000),
        error: 'RATE_LIMIT_HOUR'
      };
    }

    // Log this request
    await supabaseAdmin
      .from('request_logs')
      .insert({
        api_key_id: apiKey,
        endpoint: 'supabase-storage',
        created_at: now.toISOString()
      });

    const minuteRemaining = RATE_LIMIT_PER_MINUTE - (minuteRequests?.length || 0);
    const hourRemaining = RATE_LIMIT_PER_HOUR - (hourRequests?.length || 0);

    return { 
      allowed: true, 
      remaining: Math.min(minuteRemaining, hourRemaining)
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE };
  }
};

/**
 * Check user quota and limits
 */
const checkUserQuota = async (apiKey, fileSize = 0) => {
  try {
    const { data: usage, error } = await supabaseAdmin
      .from('provider_usage')
      .select('upload_count, total_size')
      .eq('api_key_id', apiKey)
      .eq('provider', 'supabase')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Quota check error:', error);
      return { allowed: true, remaining: { files: MAX_FILES_PER_USER, size: MAX_TOTAL_SIZE_PER_USER } };
    }

    const currentFiles = usage?.upload_count || 0;
    const currentSize = (usage?.total_size || 0) * 1024 * 1024; // Convert MB to bytes
    const newTotalSize = currentSize + fileSize;

    if (currentFiles >= MAX_FILES_PER_USER) {
      return { 
        allowed: false, 
        error: 'FILE_LIMIT_EXCEEDED', 
        details: `Maximum ${MAX_FILES_PER_USER} files allowed`,
        current: { files: currentFiles, size: currentSize }
      };
    }

    if (newTotalSize > MAX_TOTAL_SIZE_PER_USER) {
      return { 
        allowed: false, 
        error: 'SIZE_QUOTA_EXCEEDED', 
        details: `Total size would exceed ${MAX_TOTAL_SIZE_PER_USER / (1024 * 1024)}MB limit`,
        current: { files: currentFiles, size: currentSize }
      };
    }

    return { 
      allowed: true, 
      remaining: { 
        files: MAX_FILES_PER_USER - currentFiles, 
        size: MAX_TOTAL_SIZE_PER_USER - newTotalSize 
      },
      current: { files: currentFiles, size: currentSize }
    };
  } catch (error) {
    console.error('Quota check error:', error);
    return { allowed: true, remaining: { files: MAX_FILES_PER_USER, size: MAX_TOTAL_SIZE_PER_USER } };
  }
};

/**
 * Enhanced file validation for Supabase Storage upload
 */
export const validateSupabaseFile = async (file, apiKey, bucketName = SUPABASE_BUCKET) => {
  const errors = [];
  const warnings = [];

  if (!file) {
    errors.push('File is required');
    return { isValid: false, errors, warnings };
  }

  // Basic file validation
  if (!file.name || file.name.trim() === '') {
    errors.push('Filename is required');
  }

  if (!file.size || file.size === 0) {
    errors.push('File size cannot be zero');
  }

  if (file.size < MIN_FILE_SIZE) {
    errors.push(`File size must be at least ${MIN_FILE_SIZE} bytes`);
  }

  // Check file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) {
    errors.push('File must have an extension');
  }

  // Dangerous file extensions
  const dangerousExtensions = ['exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar', 'sh'];
  if (extension && dangerousExtensions.includes(extension)) {
    errors.push(`File type .${extension} is not allowed for security reasons`);
  }

  // Check MIME type
  if (!file.type) {
    warnings.push('File MIME type is not specified');
  } else {
    // Check against dangerous MIME types
    if (DANGEROUS_FILE_TYPES.some(dangerous => file.type.includes(dangerous))) {
      errors.push(`File type ${file.type} is not allowed for security reasons`);
    }

    // Check against allowed MIME types
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
    }
  }

  // Dynamic file size checking based on type
  let maxAllowedSize = MAX_FILE_SIZE;
  if (file.type) {
    for (const [typePrefix, limit] of Object.entries(FILE_TYPE_LIMITS)) {
      if (file.type.startsWith(typePrefix)) {
        maxAllowedSize = limit;
        break;
      }
    }
    if (maxAllowedSize === MAX_FILE_SIZE) {
      maxAllowedSize = FILE_TYPE_LIMITS.default;
    }
  }

  if (file.size > maxAllowedSize) {
    errors.push(`File size exceeds ${maxAllowedSize / (1024 * 1024)}MB limit for ${file.type || 'this file type'}`);
  }

  // Check filename for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  if (invalidChars.test(file.name)) {
    errors.push('Filename contains invalid characters');
  }

  // Check filename length
  if (file.name.length > 255) {
    errors.push('Filename is too long (max 255 characters)');
  }

  // Check for potential path traversal
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    errors.push('Filename cannot contain path separators or relative paths');
  }

  // Check bucket access and restrictions
  const bucketAccess = await checkBucketAccess(bucketName, apiKey, 'write');
  if (!bucketAccess.hasAccess) {
    errors.push(`Bucket access error: ${bucketAccess.details}`);
  } else if (bucketAccess.fileSizeLimit && file.size > bucketAccess.fileSizeLimit) {
    errors.push(`File size exceeds bucket limit of ${bucketAccess.fileSizeLimit / (1024 * 1024)}MB`);
  }

  // Check user quota
  const quotaCheck = await checkUserQuota(apiKey, file.size);
  if (!quotaCheck.allowed) {
    errors.push(`Quota exceeded: ${quotaCheck.details}`);
  }

  // Additional file content validation (if base64)
  if (file.data) {
    try {
      const buffer = Buffer.from(file.data, 'base64');
      if (buffer.length !== file.size) {
        warnings.push('File size mismatch between metadata and actual data');
      }

      // Basic file signature validation
      const fileSignature = buffer.slice(0, 4).toString('hex').toUpperCase();
      const validSignatures = {
        'FFD8FFE0': 'image/jpeg',
        'FFD8FFE1': 'image/jpeg',
        'FFD8FFDB': 'image/jpeg',
        '89504E47': 'image/png',
        '47494638': 'image/gif',
        '25504446': 'application/pdf',
        '504B0304': 'application/zip',
        '504B0506': 'application/zip',
        '504B0708': 'application/zip'
      };

      const detectedType = validSignatures[fileSignature];
      if (detectedType && detectedType !== file.type) {
        warnings.push(`File signature suggests ${detectedType} but MIME type is ${file.type}`);
      }
    } catch (error) {
      errors.push('Invalid file data encoding');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    maxAllowedSize,
    quotaInfo: quotaCheck.allowed ? quotaCheck.remaining : null
  };
};

/**
 * Generate a secure unique filename for Supabase Storage
 */
export const generateSupabaseFilename = (originalName, apiKey = null) => {
  try {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const extension = originalName.split('.').pop()?.toLowerCase() || 'bin';
    
    // Sanitize original name
    const baseName = originalName
      .split('.')[0]
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50); // Limit base name length

    // Add API key prefix for organization (first 8 chars)
    const keyPrefix = apiKey ? apiKey.substring(0, 8) : 'unknown';
    
    return `${keyPrefix}_${baseName}_${timestamp}_${randomBytes}.${extension}`;
  } catch (error) {
    console.error('Error generating filename:', error);
    const timestamp = Date.now();
    return `file_${timestamp}.bin`;
  }
};

/**
 * Upload file to Supabase Storage with comprehensive error handling
 */
export const uploadToSupabaseStorage = async (req, res) => {
  let apiKey;
  
  try {
    console.log('🚀 Starting Supabase Storage upload...');
    
    const { file: fileData, bucket: customBucket, makePrivate = false, metadata = {}, supabaseToken } = req.body;
    apiKey = req.apiKeyId;

    // Validate developer's Supabase token
    if (!supabaseToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_TOKEN',
        message: 'Supabase service key is required. Please provide your Supabase service role key.'
      });
    }

    // Create Supabase client using developer's token
    // Extract URL from token (JWT contains the project URL)
    let developerSupabaseUrl;
    try {
      const tokenPayload = JSON.parse(Buffer.from(supabaseToken.split('.')[1], 'base64').toString());
      developerSupabaseUrl = `https://${tokenPayload.iss.split('//')[1]}`;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SUPABASE_TOKEN',
        message: 'Invalid Supabase service key format'
      });
    }

    const developerSupabase = createClient(developerSupabaseUrl, supabaseToken);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Rate limiting check
    const rateLimitCheck = await checkRateLimit(apiKey);
    if (!rateLimitCheck.allowed) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, rateLimitCheck.error);
      return res.status(429).json({
        success: false,
        error: rateLimitCheck.error,
        message: 'Rate limit exceeded',
        resetTime: rateLimitCheck.resetTime,
        remaining: rateLimitCheck.remaining
      });
    }

    const targetBucket = customBucket || (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET);
    const file = fileData;

    if (!file) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'MISSING_FILE');
      return res.status(400).json({
        success: false,
        error: 'MISSING_FILE',
        message: 'File data is required'
      });
    }

    console.log('📁 Parsed file data:', { 
      name: file.name, 
      type: file.type, 
      size: file.size,
      bucket: targetBucket 
    });

    // Comprehensive validation
    const validation = await validateSupabaseFile(file, apiKey, targetBucket);
    if (!validation.isValid) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'VALIDATION_ERROR', {
        errors: validation.errors,
        warnings: validation.warnings,
        fileSize: file.size
      });
      
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'File validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn('⚠️ File validation warnings:', validation.warnings);
    }

    console.log(`📁 Uploading file: ${file.name} (${file.size} bytes) to bucket: ${targetBucket}`);

    // Generate unique filename
    const filename = generateSupabaseFilename(file.name, apiKey);
    console.log(`📝 Generated filename: ${filename}`);

    // Convert base64 to buffer with error handling
    let fileBuffer;
    try {
      fileBuffer = Buffer.from(file.data, 'base64');
      console.log(`📦 File buffer size: ${fileBuffer.length} bytes`);
      
      if (fileBuffer.length !== file.size) {
        console.warn(`⚠️ Size mismatch: expected ${file.size}, got ${fileBuffer.length}`);
      }
    } catch (error) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'ENCODING_ERROR', { fileSize: file.size });
      return res.status(400).json({
        success: false,
        error: 'ENCODING_ERROR',
        message: 'Invalid file encoding',
        details: error.message
      });
    }

    // Check if file already exists
    const { data: existingFile, error: existsError } = await developerSupabase.storage
      .from(targetBucket)
      .download(filename);

    if (existingFile && !existsError) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'FILE_EXISTS', { fileSize: file.size });
      return res.status(409).json({
        success: false,
        error: 'FILE_EXISTS',
        message: 'A file with this name already exists',
        suggestion: 'Use a different filename or enable overwrite'
      });
    }

    // Prepare upload options
    const uploadOptions = {
      contentType: file.type,
      upsert: false, // Don't overwrite by default
      duplex: 'half'
    };

    // Add custom metadata
    if (metadata && Object.keys(metadata).length > 0) {
      uploadOptions.metadata = {
        ...metadata,
        originalName: file.name,
        uploadedBy: apiKey.substring(0, 8),
        uploadedAt: new Date().toISOString()
      };
    }

    // Upload to Supabase Storage with retry logic
    let uploadAttempts = 0;
    const maxAttempts = 3;
    let uploadData, uploadError;

    while (uploadAttempts < maxAttempts) {
      try {
        uploadAttempts++;
        console.log(`🔄 Upload attempt ${uploadAttempts}/${maxAttempts}`);

        const result = await developerSupabase.storage
          .from(targetBucket)
          .upload(filename, fileBuffer, uploadOptions);

        uploadData = result.data;
        uploadError = result.error;
        
        if (!uploadError) break;
        
        if (uploadAttempts < maxAttempts) {
          console.warn(`⚠️ Upload attempt ${uploadAttempts} failed, retrying...`, uploadError);
          await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts)); // Exponential backoff
        }
      } catch (error) {
        uploadError = error;
        if (uploadAttempts < maxAttempts) {
          console.warn(`⚠️ Upload attempt ${uploadAttempts} threw error, retrying...`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
        }
      }
    }

    if (uploadError) {
      console.error('❌ Supabase Storage upload error after all attempts:', uploadError);
      
      let errorType = 'STORAGE_ERROR';
      let errorMessage = 'Failed to upload to Supabase Storage';
      let statusCode = 500;

      // Handle specific error types
      if (uploadError.message?.includes('row-level security')) {
        errorType = 'RLS_ERROR';
        errorMessage = 'Row-level security policy violation';
        statusCode = 403;
      } else if (uploadError.message?.includes('storage quota')) {
        errorType = 'STORAGE_QUOTA_EXCEEDED';
        errorMessage = 'Storage quota exceeded';
        statusCode = 507;
      } else if (uploadError.message?.includes('file too large')) {
        errorType = 'FILE_TOO_LARGE';
        errorMessage = 'File size exceeds storage limits';
        statusCode = 413;
      } else if (uploadError.message?.includes('bucket not found')) {
        errorType = 'BUCKET_NOT_FOUND';
        errorMessage = `Bucket '${targetBucket}' not found`;
        statusCode = 404;
      } else if (uploadError.message?.includes('insufficient permissions')) {
        errorType = 'INSUFFICIENT_PERMISSIONS';
        errorMessage = 'Insufficient permissions for this bucket';
        statusCode = 403;
      }

      await updateSupabaseMetrics(apiKey, 'supabase', false, errorType, { 
        fileSize: file.size,
        attempts: uploadAttempts,
        errorDetails: uploadError
      });
      
      return res.status(statusCode).json({
        success: false,
        error: errorType,
        message: errorMessage,
        details: uploadError.message,
        attempts: uploadAttempts
      });
    }

    // Get public URL (or signed URL for private buckets)
    let publicUrl;
    let isPrivate = false;

    try {
      if (makePrivate || targetBucket === PRIVATE_BUCKET) {
        // Generate signed URL for private files (24 hours expiry)
        const { data: signedUrlData, error: signedError } = await supabaseAdmin.storage
          .from(targetBucket)
          .createSignedUrl(filename, 24 * 60 * 60); // 24 hours

        if (signedError) {
          console.warn('⚠️ Could not generate signed URL:', signedError);
          publicUrl = null;
        } else {
          publicUrl = signedUrlData.signedUrl;
          isPrivate = true;
        }
      } else {
        // Get public URL for public files
        const { data: urlData } = supabaseAdmin.storage
          .from(targetBucket)
          .getPublicUrl(filename);

        publicUrl = urlData.publicUrl;
        isPrivate = false;
      }
    } catch (error) {
      console.warn('⚠️ Error generating URL:', error);
      publicUrl = null;
    }

    console.log(`✅ Upload successful! ${isPrivate ? 'Signed' : 'Public'} URL: ${publicUrl}`);

    // Update metrics with success
    await updateSupabaseMetrics(apiKey, 'supabase', true, 'SUCCESS', { 
      fileSize: file.size,
      attempts: uploadAttempts
    });

    // Log successful upload
    await supabaseAdmin
      .from('upload_logs')
      .insert({
        api_key_id: apiKey,
        provider: 'supabase',
        bucket: targetBucket,
        filename: filename,
        original_name: file.name,
        file_size: file.size,
        file_type: file.type,
        is_private: isPrivate,
        upload_url: publicUrl,
        created_at: new Date().toISOString()
      });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'File uploaded to Supabase Storage successfully',
      data: {
        filename: filename,
        originalName: file.name,
        size: file.size,
        type: file.type,
        url: publicUrl,
        isPrivate: isPrivate,
        provider: 'supabase',
        bucket: targetBucket,
        uploadedAt: new Date().toISOString(),
        attempts: uploadAttempts,
        quotaRemaining: validation.quotaInfo
      },
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    });

  } catch (error) {
    console.error('💥 Supabase Storage upload error:', error);
    
    // Update metrics for error
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'SERVER_ERROR', { 
        errorDetails: error.message,
        stack: error.stack
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during Supabase Storage upload',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Generate signed upload URL for Supabase Storage (ZERO bandwidth cost)
 */
export const generateSupabaseSignedUrl = async (req, res) => {
  let apiKey;
  
  try {
    console.log('🔗 Generating Supabase Storage signed upload URL...');
    
    const { 
      filename, 
      contentType, 
      fileSize, 
      bucket: customBucket, 
      makePrivate = false,
      expiresIn = 3600, // 1 hour default
      supabaseToken,
      supabaseUrl
    } = req.body;
    
    apiKey = req.apiKeyId;

    // Validate developer's Supabase credentials
    if (!supabaseToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_TOKEN',
        message: 'Supabase service key is required. Please provide your Supabase service role key.'
      });
    }

    if (!supabaseUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_URL',
        message: 'Supabase project URL is required. Please provide your Supabase project URL.'
      });
    }

    // Create Supabase client using developer's credentials
    const developerSupabase = createClient(supabaseUrl, supabaseToken);

    // Rate limiting check
    const rateLimitCheck = await checkRateLimit(apiKey);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: rateLimitCheck.error,
        message: 'Rate limit exceeded',
        resetTime: rateLimitCheck.resetTime
      });
    }

    // Validate required fields
    if (!filename || !contentType || !fileSize || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'filename, contentType, fileSize, and API key are required'
      });
    }

    const targetBucket = customBucket || (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET);

    // Check bucket access
    const bucketAccess = await checkBucketAccess(targetBucket, apiKey, 'write');
    if (!bucketAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: bucketAccess.error,
        message: 'Bucket access denied',
        details: bucketAccess.details
      });
    }

    // Create mock file object for validation
    const mockFile = {
      name: filename,
      type: contentType,
      size: fileSize
    };

    // Validate file
    const validation = await validateSupabaseFile(mockFile, apiKey, targetBucket);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'File validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // Generate unique filename
    const uniqueFilename = generateSupabaseFilename(filename, apiKey);
    console.log(`📝 Generated unique filename: ${uniqueFilename}`);

    // Check expiration limits
    const maxExpiration = makePrivate ? 24 * 60 * 60 : 7 * 24 * 60 * 60; // 24h for private, 7 days for public
    const finalExpiresIn = Math.min(expiresIn, maxExpiration);

    // Generate signed upload URL using Supabase Storage API
    const { data: signedUrlData, error: signedUrlError } = await developerSupabase.storage
      .from(targetBucket)
      .createSignedUploadUrl(uniqueFilename, {
        expiresIn: finalExpiresIn
      });

    if (signedUrlError) {
      console.error('❌ Failed to generate signed upload URL:', signedUrlError);
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'SIGNED_URL_ERROR', { 
        errorDetails: signedUrlError.message 
      });
      
      return res.status(500).json({
        success: false,
        error: 'SIGNED_URL_ERROR',
        message: 'Failed to generate signed upload URL',
        details: signedUrlError.message
      });
    }

    console.log(`✅ Generated signed upload URL for: ${uniqueFilename}`);

    // Get the final public URL (for after upload completion)
    let finalUrl;
    if (makePrivate || targetBucket === PRIVATE_BUCKET) {
      // For private files, we'll generate signed download URLs as needed
      finalUrl = null; // Will be generated after upload
    } else {
      const { data: urlData } = developerSupabase.storage
        .from(targetBucket)
        .getPublicUrl(uniqueFilename);
      finalUrl = urlData.publicUrl;
    }
    
    res.status(200).json({
      success: true,
      message: 'Supabase Storage signed upload URL generated successfully',
      data: {
        uploadUrl: signedUrlData.signedUrl,
        token: signedUrlData.token, // Required for uploadToSignedUrl
        filename: uniqueFilename,
        originalName: filename,
        contentType: contentType,
        fileSize: fileSize,
        provider: 'supabase',
        bucket: targetBucket,
        isPrivate: makePrivate,
        expiresIn: finalExpiresIn,
        expiresAt: new Date(Date.now() + finalExpiresIn * 1000).toISOString(),
        fileUrl: finalUrl, // Final URL after upload
        method: 'PUT', // Supabase signed URLs use PUT
        headers: {
          'Content-Type': contentType
        },
        maxFileSize: validation.maxAllowedSize,
        quotaRemaining: validation.quotaInfo,
        instructions: {
          note: 'Use Supabase client uploadToSignedUrl method for direct upload',
          sdkExample: `import { createClient } from '@supabase/supabase-js';
const { data, error } = await supabase.storage
  .from('${targetBucket}')
  .uploadToSignedUrl('${uniqueFilename}', '${signedUrlData.token}', file);`,
          curlExample: `curl -X PUT "${signedUrlData.signedUrl}" -H "Content-Type: ${contentType}" --data-binary @yourfile`
        }
      },
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    });

  } catch (error) {
    console.error('💥 Signed URL generation error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'CONFIG_ERROR', { 
        errorDetails: error.message 
      });
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
 * Delete file from Supabase Storage with enhanced validation
 */
export const deleteSupabaseFile = async (req, res) => {
  let apiKey;
  
  try {
    console.log('🗑️ Deleting file from Supabase Storage...');
    
    const { fileUrl, filename, bucket: customBucket, force = false, supabaseToken, supabaseUrl } = req.body;
    apiKey = req.apiKeyId;

    // Validate developer's Supabase credentials
    if (!supabaseToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_TOKEN',
        message: 'Supabase service key is required. Please provide your Supabase service role key.'
      });
    }

    if (!supabaseUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_URL',
        message: 'Supabase project URL is required. Please provide your Supabase project URL.'
      });
    }

    // Create Supabase client using developer's credentials
    const developerSupabase = createClient(supabaseUrl, supabaseToken);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Rate limiting check
    const rateLimitCheck = await checkRateLimit(apiKey);
    if (!rateLimitCheck.allowed) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, rateLimitCheck.error);
      return res.status(429).json({
        success: false,
        error: rateLimitCheck.error,
        message: 'Rate limit exceeded'
      });
    }

    if (!fileUrl && !filename) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'MISSING_PARAMETERS');
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or filename is required'
      });
    }

    let targetFilename;
    let targetBucket = customBucket || SUPABASE_BUCKET;

    // Extract filename from URL if provided
    if (fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        targetFilename = pathParts[pathParts.length - 1];
        
        // Try to extract bucket from URL
        const bucketMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^\/]+)\//);
        if (bucketMatch) {
          targetBucket = bucketMatch[1];
        }
      } catch (error) {
        await updateSupabaseMetrics(apiKey, 'supabase', false, 'INVALID_URL');
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    } else {
      targetFilename = filename;
    }

    if (!targetFilename) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'INVALID_FILENAME');
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILENAME',
        message: 'Could not determine filename'
      });
    }

    console.log(`📁 Deleting file: ${targetFilename} from bucket: ${targetBucket}`);

    // Check if user has permission to delete this file
    const { data: uploadLog, error: logError } = await supabaseAdmin
      .from('upload_logs')
      .select('*')
      .eq('filename', targetFilename)
      .eq('bucket', targetBucket)
      .single();

    if (logError && logError.code !== 'PGRST116') {
      console.warn('⚠️ Could not verify file ownership:', logError);
    }

    if (uploadLog && uploadLog.api_key_id !== apiKey && !force) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'UNAUTHORIZED_DELETE');
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_DELETE',
        message: 'You do not have permission to delete this file',
        suggestion: 'Use force=true if you have admin privileges'
      });
    }

    // Check if file exists before attempting to delete
    const { data: fileExists, error: existsError } = await developerSupabase.storage
      .from(targetBucket)
      .download(targetFilename);

    if (existsError || !fileExists) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'FILE_NOT_FOUND');
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: 'File not found in storage',
        details: existsError?.message
      });
    }

    // Delete from Supabase Storage
    const { data, error } = await developerSupabase.storage
      .from(targetBucket)
      .remove([targetFilename]);

    if (error) {
      console.error('❌ Supabase Storage delete error:', error);
      
      let errorType = 'DELETE_ERROR';
      let statusCode = 500;
      
      if (error.message?.includes('not found')) {
        errorType = 'FILE_NOT_FOUND';
        statusCode = 404;
      } else if (error.message?.includes('permission')) {
        errorType = 'DELETE_PERMISSION_DENIED';
        statusCode = 403;
      }

      await updateSupabaseMetrics(apiKey, 'supabase', false, errorType);
      return res.status(statusCode).json({
        success: false,
        error: errorType,
        message: 'Failed to delete file from Supabase Storage',
        details: error.message
      });
    }

    // Update user quota (subtract deleted file size)
    if (uploadLog?.file_size) {
      const fileSizeInMB = uploadLog.file_size / (1024 * 1024);
      
      const { data: currentUsage } = await supabaseAdmin
        .from('provider_usage')
        .select('total_size')
        .eq('api_key_id', apiKey)
        .eq('provider', 'supabase')
        .single();

      if (currentUsage) {
        await supabaseAdmin
          .from('provider_usage')
          .update({
            total_size: Math.max(0, (currentUsage.total_size || 0) - fileSizeInMB),
            updated_at: new Date().toISOString()
          })
          .eq('api_key_id', apiKey)
          .eq('provider', 'supabase');
      }
    }

    // Remove from upload logs
    if (uploadLog) {
      await supabaseAdmin
        .from('upload_logs')
        .delete()
        .eq('filename', targetFilename)
        .eq('bucket', targetBucket);
    }

    console.log(`✅ File deleted successfully: ${targetFilename}`);

    // Update metrics
    await updateSupabaseMetrics(apiKey, 'supabase', true, 'DELETE_SUCCESS');

    res.status(200).json({
      success: true,
      message: 'File deleted from Supabase Storage successfully',
      data: {
        filename: targetFilename,
        bucket: targetBucket,
        deletedAt: new Date().toISOString(),
        provider: 'supabase',
        fileSize: uploadLog?.file_size || 0
      }
    });

  } catch (error) {
    console.error('💥 Supabase Storage delete error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'DELETE_SERVER_ERROR', { 
        errorDetails: error.message 
      });
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
 * Move file between public and private buckets
 */
export const moveSupabaseFile = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📦 Moving file between Supabase Storage buckets...');
    
    const { 
      filename, 
      sourceBucket, 
      targetBucket, 
      makePrivate, 
      makePublic 
    } = req.body;
    
    apiKey = req.apiKeyId;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    if (!filename || (!sourceBucket && (!makePrivate && !makePublic))) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'filename and either sourceBucket or makePrivate/makePublic flags are required'
      });
    }

    // Determine source and target buckets
    const source = sourceBucket || (makePrivate ? SUPABASE_BUCKET : PRIVATE_BUCKET);
    const target = targetBucket || (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET);

    if (source === target) {
      return res.status(400).json({
        success: false,
        error: 'SAME_BUCKET',
        message: 'Source and target buckets are the same'
      });
    }

    console.log(`📁 Moving ${filename} from ${source} to ${target}`);

    // Check access to both buckets
    const sourceAccess = await checkBucketAccess(source, apiKey, 'read');
    const targetAccess = await checkBucketAccess(target, apiKey, 'write');

    if (!sourceAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'SOURCE_BUCKET_ACCESS_DENIED',
        message: 'No access to source bucket',
        details: sourceAccess.details
      });
    }

    if (!targetAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'TARGET_BUCKET_ACCESS_DENIED',
        message: 'No access to target bucket',
        details: targetAccess.details
      });
    }

    // Check if file exists in source bucket
    const { data: sourceFile, error: downloadError } = await supabaseAdmin.storage
      .from(source)
      .download(filename);

    if (downloadError || !sourceFile) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_FILE_NOT_FOUND',
        message: 'File not found in source bucket'
      });
    }

    // Get file metadata
    const { data: fileList, error: listError } = await supabaseAdmin.storage
      .from(source)
      .list('', { search: filename });

    const fileMetadata = fileList?.find(f => f.name === filename);

    // Upload to target bucket
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(target)
      .upload(filename, sourceFile, {
        contentType: fileMetadata?.metadata?.contentType || 'application/octet-stream',
        upsert: true
      });

    if (uploadError) {
      return res.status(500).json({
        success: false,
        error: 'UPLOAD_TO_TARGET_FAILED',
        message: 'Failed to upload file to target bucket',
        details: uploadError.message
      });
    }

    // Delete from source bucket
    const { error: deleteError } = await supabaseAdmin.storage
      .from(source)
      .remove([filename]);

    if (deleteError) {
      console.warn('⚠️ Failed to delete from source bucket:', deleteError);
      // Don't fail the operation, just warn
    }

    // Update upload logs
    await supabaseAdmin
      .from('upload_logs')
      .update({
        bucket: target,
        is_private: target === PRIVATE_BUCKET,
        updated_at: new Date().toISOString()
      })
      .eq('filename', filename)
      .eq('api_key_id', apiKey);

    // Generate new URL
    let newUrl;
    if (target === PRIVATE_BUCKET) {
      const { data: signedUrlData } = await supabaseAdmin.storage
        .from(target)
        .createSignedUrl(filename, 24 * 60 * 60);
      newUrl = signedUrlData?.signedUrl;
    } else {
      const { data: urlData } = supabaseAdmin.storage
        .from(target)
        .getPublicUrl(filename);
      newUrl = urlData.publicUrl;
    }

    await updateSupabaseMetrics(apiKey, 'supabase', true, 'MOVE_SUCCESS');

    res.status(200).json({
      success: true,
      message: `File moved from ${source} to ${target} successfully`,
      data: {
        filename: filename,
        sourceBucket: source,
        targetBucket: target,
        newUrl: newUrl,
        isPrivate: target === PRIVATE_BUCKET,
        movedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 File move error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'MOVE_ERROR', { 
        errorDetails: error.message 
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file move',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Cancel Supabase Storage upload with proper cleanup
 */
export const cancelSupabaseUpload = async (req, res) => {
  let apiKey;
  
  try {
    console.log('🚫 Cancelling Supabase Storage upload...');
    
    const { uploadId, filename, bucket = SUPABASE_BUCKET, reason = 'user_cancelled', supabaseToken, supabaseUrl } = req.body;
    apiKey = req.apiKeyId;

    // Validate developer's Supabase credentials
    if (!supabaseToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_TOKEN',
        message: 'Supabase service key is required. Please provide your Supabase service role key.'
      });
    }

    if (!supabaseUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_URL',
        message: 'Supabase project URL is required. Please provide your Supabase project URL.'
      });
    }

    // Create Supabase client using developer's credentials
    const developerSupabase = createClient(supabaseUrl, supabaseToken);
    
    if (!uploadId && !filename) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either uploadId or filename is required'
      });
    }

    // Try to clean up partially uploaded file if it exists
    if (filename) {
      try {
        await developerSupabase.storage
          .from(bucket)
          .remove([filename]);
        console.log(`🗑️ Cleaned up partial file: ${filename}`);
      } catch (error) {
        console.warn('⚠️ Could not clean up partial file:', error);
      }
    }

    // Log cancellation
    await supabaseAdmin
      .from('upload_logs')
      .insert({
        api_key_id: apiKey,
        provider: 'supabase',
        bucket: bucket,
        filename: filename || uploadId,
        status: 'cancelled',
        cancellation_reason: reason,
        created_at: new Date().toISOString()
      });

    console.log(`✅ Upload cancellation processed for: ${uploadId || filename}`);

    // Update metrics
    await updateSupabaseMetrics(apiKey, 'supabase', true, 'CANCELLED');

    res.status(200).json({
      success: true,
      message: 'Upload cancellation request processed successfully',
      data: {
        uploadId: uploadId || filename,
        filename: filename,
        bucket: bucket,
        reason: reason,
        cancelledAt: new Date().toISOString(),
        provider: 'supabase'
      }
    });

  } catch (error) {
    console.error('💥 Supabase Storage cancel error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'CANCEL_ERROR', { 
        errorDetails: error.message 
      });
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
 * List files in Supabase Storage bucket with advanced filtering
 */
export const listSupabaseFiles = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📋 Listing files in Supabase Storage...');
    
    const { 
      limit = 100, 
      offset = 0, 
      bucket = SUPABASE_BUCKET,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search = '',
      fileType = '',
      minSize = 0,
      maxSize = Infinity,
      dateFrom = null,
      dateTo = null
    } = req.body;
    
    apiKey = req.apiKeyId;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Check bucket access
    const bucketAccess = await checkBucketAccess(bucket, apiKey, 'read');
    if (!bucketAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: bucketAccess.error,
        message: 'Bucket access denied',
        details: bucketAccess.details
      });
    }

    // Build query for upload logs (more detailed than storage list)
    let query = supabaseAdmin
      .from('upload_logs')
      .select('*')
      .eq('api_key_id', apiKey)
      .eq('bucket', bucket)
      .neq('status', 'cancelled');

    // Apply filters
    if (search) {
      query = query.or(`filename.ilike.%${search}%,original_name.ilike.%${search}%`);
    }

    if (fileType) {
      query = query.like('file_type', `${fileType}%`);
    }

    if (minSize > 0) {
      query = query.gte('file_size', minSize);
    }

    if (maxSize < Infinity) {
      query = query.lte('file_size', maxSize);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Apply sorting
    const validSortFields = ['created_at', 'file_size', 'filename', 'original_name'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? true : false;
    
    query = query.order(sortField, { ascending: order });

    // Apply pagination
    query = query.range(offset, offset + Math.min(limit, 1000) - 1);

    const { data: uploadLogs, error: logsError } = await query;

    if (logsError) {
      console.error('❌ Error fetching upload logs:', logsError);
      // Fallback to direct storage listing
      const { data: storageFiles, error: storageError } = await supabaseAdmin.storage
        .from(bucket)
        .list('', {
          limit: Math.min(limit, 1000),
          offset: offset,
          sortBy: { column: 'created_at', order: sortOrder }
        });

      if (storageError) {
        return res.status(500).json({
          success: false,
          error: 'LIST_ERROR',
          message: 'Failed to list files from Supabase Storage',
          details: storageError.message
        });
      }

      // Transform storage files to standard format
      const transformedFiles = storageFiles.map(file => {
        const { data: urlData } = supabaseAdmin.storage
          .from(bucket)
          .getPublicUrl(file.name);
        
        return {
          filename: file.name,
          originalName: file.name,
          size: file.metadata?.size || 0,
          type: file.metadata?.mimetype || 'unknown',
          lastModified: file.updated_at,
          url: urlData.publicUrl,
          provider: 'supabase',
          bucket: bucket,
          isPrivate: bucket === PRIVATE_BUCKET
        };
      });

      return res.status(200).json({
        success: true,
        message: 'Files listed successfully (storage fallback)',
        data: {
          files: transformedFiles,
          total: transformedFiles.length,
          limit: limit,
          offset: offset,
          provider: 'supabase',
          bucket: bucket
        }
      });
    }

    // Transform upload logs to file list with current URLs
    const filesWithUrls = await Promise.all(uploadLogs.map(async (log) => {
      let currentUrl = log.upload_url;
      
      // Generate fresh URL for private files or if URL is missing
      if (!currentUrl || log.is_private) {
        try {
          if (log.is_private) {
            const { data: signedUrlData } = await supabaseAdmin.storage
              .from(log.bucket)
              .createSignedUrl(log.filename, 24 * 60 * 60);
            currentUrl = signedUrlData?.signedUrl || null;
          } else {
            const { data: urlData } = supabaseAdmin.storage
              .from(log.bucket)
              .getPublicUrl(log.filename);
            currentUrl = urlData.publicUrl;
          }
        } catch (error) {
          console.warn(`⚠️ Could not generate URL for ${log.filename}:`, error);
        }
      }

      // Verify file still exists
      let exists = true;
      try {
        const { error: downloadError } = await supabaseAdmin.storage
          .from(log.bucket)
          .download(log.filename);
        if (downloadError) exists = false;
      } catch {
        exists = false;
      }

      return {
        filename: log.filename,
        originalName: log.original_name || log.filename,
        size: log.file_size || 0,
        type: log.file_type || 'unknown',
        lastModified: log.created_at,
        url: currentUrl,
        provider: 'supabase',
        bucket: log.bucket,
        isPrivate: log.is_private || false,
        uploadedAt: log.created_at,
        exists: exists,
        metadata: {
          uploadId: log.id,
          apiKeyId: log.api_key_id
        }
      };
    }));

    // Filter out non-existent files if requested
    const existingFiles = filesWithUrls.filter(file => file.exists);

    console.log(`✅ Listed ${existingFiles.length} files (${filesWithUrls.length - existingFiles.length} missing)`);

    res.status(200).json({
      success: true,
      message: 'Files listed successfully',
      data: {
        files: existingFiles,
        total: existingFiles.length,
        totalInDatabase: uploadLogs.length,
        missing: filesWithUrls.length - existingFiles.length,
        limit: limit,
        offset: offset,
        provider: 'supabase',
        bucket: bucket,
        filters: {
          search,
          fileType,
          minSize,
          maxSize,
          dateFrom,
          dateTo,
          sortBy: sortField,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('💥 Supabase Storage list error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'LIST_ERROR', { 
        errorDetails: error.message 
      });
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
 * Get file metadata and info
 */
export const getSupabaseFileInfo = async (req, res) => {
  let apiKey;
  
  try {
    console.log('ℹ️ Getting Supabase file info...');
    
    const { filename, fileUrl, bucket = SUPABASE_BUCKET } = req.body;
    apiKey = req.apiKeyId;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    let targetFilename = filename;
    let targetBucket = bucket;

    // Extract filename from URL if provided
    if (fileUrl && !filename) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        targetFilename = pathParts[pathParts.length - 1];
        
        const bucketMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^\/]+)\//);
        if (bucketMatch) {
          targetBucket = bucketMatch[1];
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    }

    if (!targetFilename) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either filename or fileUrl is required'
      });
    }

    // Check bucket access
    const bucketAccess = await checkBucketAccess(targetBucket, apiKey, 'read');
    if (!bucketAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: bucketAccess.error,
        message: 'Bucket access denied',
        details: bucketAccess.details
      });
    }

    // Get file info from storage
    const { data: fileList, error: listError } = await supabaseAdmin.storage
      .from(targetBucket)
      .list('', { search: targetFilename });

    const storageFile = fileList?.find(f => f.name === targetFilename);
    
    if (listError || !storageFile) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: 'File not found in storage'
      });
    }

    // Get detailed info from upload logs
    const { data: uploadLog, error: logError } = await supabaseAdmin
      .from('upload_logs')
      .select('*')
      .eq('filename', targetFilename)
      .eq('bucket', targetBucket)
      .single();

    // Generate current URL
    let currentUrl;
    let isPrivate = targetBucket === PRIVATE_BUCKET;
    
    if (isPrivate) {
      const { data: signedUrlData } = await supabaseAdmin.storage
        .from(targetBucket)
        .createSignedUrl(targetFilename, 24 * 60 * 60);
      currentUrl = signedUrlData?.signedUrl;
    } else {
      const { data: urlData } = supabaseAdmin.storage
        .from(targetBucket)
        .getPublicUrl(targetFilename);
      currentUrl = urlData.publicUrl;
    }

    // Check if file is accessible
    let isAccessible = true;
    try {
      const { error: downloadError } = await supabaseAdmin.storage
        .from(targetBucket)
        .download(targetFilename);
      if (downloadError) isAccessible = false;
    } catch {
      isAccessible = false;
    }

    const fileInfo = {
      filename: targetFilename,
      originalName: uploadLog?.original_name || targetFilename,
      size: storageFile.metadata?.size || uploadLog?.file_size || 0,
      type: uploadLog?.file_type || storageFile.metadata?.mimetype || 'unknown',
      bucket: targetBucket,
      provider: 'supabase',
      isPrivate: isPrivate,
      url: currentUrl,
      isAccessible: isAccessible,
      createdAt: storageFile.created_at,
      updatedAt: storageFile.updated_at,
      lastModified: storageFile.updated_at,
      metadata: {
        storageMetadata: storageFile.metadata || {},
        uploadedBy: uploadLog?.api_key_id?.substring(0, 8) || 'unknown',
        uploadedAt: uploadLog?.created_at,
        checksum: storageFile.metadata?.cacheControl || null
      }
    };

    await updateSupabaseMetrics(apiKey, 'supabase', true, 'INFO_SUCCESS');

    res.status(200).json({
      success: true,
      message: 'File info retrieved successfully',
      data: fileInfo
    });

  } catch (error) {
    console.error('💥 Get file info error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'INFO_ERROR', { 
        errorDetails: error.message 
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while retrieving file info',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update file metadata or rename file
 */
export const updateSupabaseFile = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📝 Updating Supabase file...');
    
    const { 
      filename, 
      newFilename, 
      bucket = SUPABASE_BUCKET, 
      metadata = {},
      makePrivate,
      makePublic 
    } = req.body;
    
    apiKey = req.apiKeyId;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'filename is required'
      });
    }

    // Check if file exists
    const { data: fileExists, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(filename);

    if (downloadError || !fileExists) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: 'File not found in storage'
      });
    }

    let operations = [];
    let finalFilename = filename;

    // Handle privacy change (move between buckets)
    if (makePrivate || makePublic) {
      const targetBucket = makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET;
      
      if (targetBucket !== bucket) {
        // Move file to different bucket
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from(targetBucket)
          .upload(filename, fileExists, {
            contentType: fileExists.type,
            upsert: true
          });

        if (uploadError) {
          return res.status(500).json({
            success: false,
            error: 'PRIVACY_CHANGE_FAILED',
            message: 'Failed to change file privacy',
            details: uploadError.message
          });
        }

        // Delete from source bucket
        await supabaseAdmin.storage
          .from(bucket)
          .remove([filename]);

        // Update upload logs
        await supabaseAdmin
          .from('upload_logs')
          .update({
            bucket: targetBucket,
            is_private: makePrivate || false,
            updated_at: new Date().toISOString()
          })
          .eq('filename', filename)
          .eq('api_key_id', apiKey);

        operations.push(`moved to ${targetBucket}`);
      }
    }

    // Handle file rename
    if (newFilename && newFilename !== filename) {
      // Validate new filename
      const invalidChars = /[<>:"|?*\x00-\x1f]/;
      if (invalidChars.test(newFilename)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_FILENAME',
          message: 'New filename contains invalid characters'
        });
      }

      const targetBucket = (makePrivate || makePublic) ? 
        (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET) : bucket;

      // Check if new filename already exists
      const { data: existingFile } = await supabaseAdmin.storage
        .from(targetBucket)
        .download(newFilename);

      if (existingFile) {
        return res.status(409).json({
          success: false,
          error: 'FILENAME_EXISTS',
          message: 'A file with the new name already exists'
        });
      }

      // Copy file with new name
      const { error: copyError } = await supabaseAdmin.storage
        .from(targetBucket)
        .upload(newFilename, fileExists, {
          contentType: fileExists.type,
          upsert: false
        });

      if (copyError) {
        return res.status(500).json({
          success: false,
          error: 'RENAME_FAILED',
          message: 'Failed to rename file',
          details: copyError.message
        });
      }

      // Delete old file
      await supabaseAdmin.storage
        .from(targetBucket)
        .remove([filename]);

      // Update upload logs
      await supabaseAdmin
        .from('upload_logs')
        .update({
          filename: newFilename,
          updated_at: new Date().toISOString()
        })
        .eq('filename', filename)
        .eq('api_key_id', apiKey);

      finalFilename = newFilename;
      operations.push(`renamed to ${newFilename}`);
    }

    // Update custom metadata in logs
    if (metadata && Object.keys(metadata).length > 0) {
      await supabaseAdmin
        .from('upload_logs')
        .update({
          custom_metadata: metadata,
          updated_at: new Date().toISOString()
        })
        .eq('filename', finalFilename)
        .eq('api_key_id', apiKey);

      operations.push('metadata updated');
    }

    // Generate new URL
    const finalBucket = (makePrivate || makePublic) ? 
      (makePrivate ? PRIVATE_BUCKET : SUPABASE_BUCKET) : bucket;
    
    let newUrl;
    if (finalBucket === PRIVATE_BUCKET) {
      const { data: signedUrlData } = await supabaseAdmin.storage
        .from(finalBucket)
        .createSignedUrl(finalFilename, 24 * 60 * 60);
      newUrl = signedUrlData?.signedUrl;
    } else {
      const { data: urlData } = supabaseAdmin.storage
        .from(finalBucket)
        .getPublicUrl(finalFilename);
      newUrl = urlData.publicUrl;
    }

    await updateSupabaseMetrics(apiKey, 'supabase', true, 'UPDATE_SUCCESS');

    res.status(200).json({
      success: true,
      message: `File updated successfully: ${operations.join(', ')}`,
      data: {
        originalFilename: filename,
        currentFilename: finalFilename,
        bucket: finalBucket,
        url: newUrl,
        isPrivate: finalBucket === PRIVATE_BUCKET,
        operations: operations,
        updatedAt: new Date().toISOString(),
        provider: 'supabase'
      }
    });

  } catch (error) {
    console.error('💥 Update file error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'UPDATE_ERROR', { 
        errorDetails: error.message 
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file update',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Copy file within or between buckets
 */
export const copySupabaseFile = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📋 Copying Supabase file...');
    
    const { 
      sourceFilename, 
      targetFilename, 
      sourceBucket = SUPABASE_BUCKET, 
      targetBucket = SUPABASE_BUCKET,
      overwrite = false 
    } = req.body;
    
    apiKey = req.apiKeyId;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    if (!sourceFilename || !targetFilename) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'sourceFilename and targetFilename are required'
      });
    }

    // Check access to both buckets
    const sourceAccess = await checkBucketAccess(sourceBucket, apiKey, 'read');
    const targetAccess = await checkBucketAccess(targetBucket, apiKey, 'write');

    if (!sourceAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'SOURCE_BUCKET_ACCESS_DENIED',
        message: 'No read access to source bucket'
      });
    }

    if (!targetAccess.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'TARGET_BUCKET_ACCESS_DENIED',
        message: 'No write access to target bucket'
      });
    }

    // Check if source file exists
    const { data: sourceFile, error: downloadError } = await supabaseAdmin.storage
      .from(sourceBucket)
      .download(sourceFilename);

    if (downloadError || !sourceFile) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_FILE_NOT_FOUND',
        message: 'Source file not found'
      });
    }

    // Check if target file exists
    const { data: existingTarget } = await supabaseAdmin.storage
      .from(targetBucket)
      .download(targetFilename);

    if (existingTarget && !overwrite) {
      return res.status(409).json({
        success: false,
        error: 'TARGET_FILE_EXISTS',
        message: 'Target file already exists. Use overwrite=true to replace it.'
      });
    }

    // Get source file metadata
    const { data: sourceLog } = await supabaseAdmin
      .from('upload_logs')
      .select('*')
      .eq('filename', sourceFilename)
      .eq('bucket', sourceBucket)
      .single();

    // Copy file
    const { data: copyData, error: copyError } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(targetFilename, sourceFile, {
        contentType: sourceLog?.file_type || 'application/octet-stream',
        upsert: overwrite
      });

    if (copyError) {
      return res.status(500).json({
        success: false,
        error: 'COPY_FAILED',
        message: 'Failed to copy file',
        details: copyError.message
      });
    }

    // Create upload log for copied file
    await supabaseAdmin
      .from('upload_logs')
      .insert({
        api_key_id: apiKey,
        provider: 'supabase',
        bucket: targetBucket,
        filename: targetFilename,
        original_name: sourceLog?.original_name || sourceFilename,
        file_size: sourceLog?.file_size || 0,
        file_type: sourceLog?.file_type || 'unknown',
        is_private: targetBucket === PRIVATE_BUCKET,
        created_at: new Date().toISOString(),
        copied_from: sourceFilename
      });

    // Generate URL for copied file
    let newUrl;
    if (targetBucket === PRIVATE_BUCKET) {
      const { data: signedUrlData } = await supabaseAdmin.storage
        .from(targetBucket)
        .createSignedUrl(targetFilename, 24 * 60 * 60);
      newUrl = signedUrlData?.signedUrl;
    } else {
      const { data: urlData } = supabaseAdmin.storage
        .from(targetBucket)
        .getPublicUrl(targetFilename);
      newUrl = urlData.publicUrl;
    }

    await updateSupabaseMetrics(apiKey, 'supabase', true, 'COPY_SUCCESS', {
      fileSize: sourceLog?.file_size || 0
    });

    res.status(200).json({
      success: true,
      message: 'File copied successfully',
      data: {
        sourceFilename: sourceFilename,
        targetFilename: targetFilename,
        sourceBucket: sourceBucket,
        targetBucket: targetBucket,
        url: newUrl,
        isPrivate: targetBucket === PRIVATE_BUCKET,
        copiedAt: new Date().toISOString(),
        provider: 'supabase',
        overwritten: existingTarget ? true : false
      }
    });

  } catch (error) {
    console.error('💥 Copy file error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'COPY_ERROR', { 
        errorDetails: error.message 
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error during file copy',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get storage statistics and usage info
 */
export const getSupabaseStorageStats = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📊 Getting Supabase storage statistics...');
    
    apiKey = req.apiKeyId;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Get usage statistics
    const { data: usage, error: usageError } = await supabaseAdmin
      .from('provider_usage')
      .select('*')
      .eq('api_key_id', apiKey)
      .eq('provider', 'supabase')
      .single();

    if (usageError && usageError.code !== 'PGRST116') {
      console.error('Usage stats error:', usageError);
    }

    // Get detailed file statistics
    const { data: fileStats, error: statsError } = await supabaseAdmin
      .from('upload_logs')
      .select('file_size, file_type, bucket, created_at, is_private')
      .eq('api_key_id', apiKey)
      .neq('status', 'cancelled');

    if (statsError) {
      console.error('File stats error:', statsError);
    }

    // Calculate statistics
    const stats = {
      totalFiles: fileStats?.length || 0,
      totalSize: usage?.total_size || 0, // in MB
      totalSizeBytes: (usage?.total_size || 0) * 1024 * 1024,
      publicFiles: fileStats?.filter(f => !f.is_private).length || 0,
      privateFiles: fileStats?.filter(f => f.is_private).length || 0,
      bucketStats: {},
      fileTypeStats: {},
      sizeDistribution: {
        small: 0, // < 1MB
        medium: 0, // 1MB - 10MB
        large: 0, // 10MB - 100MB
        xlarge: 0 // > 100MB
      },
      quotaUsage: {
        filesUsed: fileStats?.length || 0,
        filesLimit: MAX_FILES_PER_USER,
        filesRemaining: MAX_FILES_PER_USER - (fileStats?.length || 0),
        sizeUsed: usage?.total_size || 0, // MB
        sizeLimit: MAX_TOTAL_SIZE_PER_USER / (1024 * 1024), // Convert to MB
        sizeRemaining: (MAX_TOTAL_SIZE_PER_USER / (1024 * 1024)) - (usage?.total_size || 0)
      },
      recentUploads: 0,
      uploadTrends: {}
    };

    // Calculate bucket statistics
    if (fileStats) {
      const bucketGroups = fileStats.reduce((acc, file) => {
        const bucket = file.bucket || 'unknown';
        if (!acc[bucket]) {
          acc[bucket] = { count: 0, size: 0 };
        }
        acc[bucket].count++;
        acc[bucket].size += (file.file_size || 0) / (1024 * 1024); // Convert to MB
        return acc;
      }, {});
      
      stats.bucketStats = bucketGroups;

      // Calculate file type statistics
      const typeGroups = fileStats.reduce((acc, file) => {
        const type = file.file_type?.split('/')[0] || 'unknown';
        if (!acc[type]) {
          acc[type] = { count: 0, size: 0 };
        }
        acc[type].count++;
        acc[type].size += (file.file_size || 0) / (1024 * 1024);
        return acc;
      }, {});
      
      stats.fileTypeStats = typeGroups;

      // Calculate size distribution
      fileStats.forEach(file => {
        const sizeMB = (file.file_size || 0) / (1024 * 1024);
        if (sizeMB < 1) stats.sizeDistribution.small++;
        else if (sizeMB < 10) stats.sizeDistribution.medium++;
        else if (sizeMB < 100) stats.sizeDistribution.large++;
        else stats.sizeDistribution.xlarge++;
      });

      // Calculate recent uploads (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      stats.recentUploads = fileStats.filter(file => 
        new Date(file.created_at) > sevenDaysAgo
      ).length;

      // Calculate upload trends (last 30 days by day)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentFiles = fileStats.filter(file => 
        new Date(file.created_at) > thirtyDaysAgo
      );

      const trendsByDay = recentFiles.reduce((acc, file) => {
        const date = new Date(file.created_at).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { count: 0, size: 0 };
        }
        acc[date].count++;
        acc[date].size += (file.file_size || 0) / (1024 * 1024);
        return acc;
      }, {});

      stats.uploadTrends = trendsByDay;
    }

    await updateSupabaseMetrics(apiKey, 'supabase', true, 'STATS_SUCCESS');

    res.status(200).json({
      success: true,
      message: 'Storage statistics retrieved successfully',
      data: {
        statistics: stats,
        provider: 'supabase',
        generatedAt: new Date().toISOString(),
        accountLimits: {
          maxFiles: MAX_FILES_PER_USER,
          maxTotalSize: MAX_TOTAL_SIZE_PER_USER,
          maxFileSize: MAX_FILE_SIZE,
          rateLimitPerMinute: RATE_LIMIT_PER_MINUTE,
          rateLimitPerHour: RATE_LIMIT_PER_HOUR
        }
      }
    });

  } catch (error) {
    console.error('💥 Get stats error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'STATS_ERROR', { 
        errorDetails: error.message 
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Internal server error while retrieving statistics',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Download file from Supabase Storage (public or private)
 */
export const downloadSupabaseFile = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📥 Downloading file from Supabase Storage...');
    
    const { 
      fileUrl, 
      filename, 
      bucket = SUPABASE_BUCKET,
      expiresIn = 3600, // 1 hour default for signed URLs
      supabaseToken,
      supabaseUrl
    } = req.body;
    
    apiKey = req.apiKeyId;

    // Validate developer's Supabase credentials
    if (!supabaseToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_TOKEN',
        message: 'Supabase service key is required. Please provide your Supabase service role key.'
      });
    }

    if (!supabaseUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_URL',
        message: 'Supabase project URL is required. Please provide your Supabase project URL.'
      });
    }

    // Create Supabase client using developer's credentials
    const developerSupabase = createClient(supabaseUrl, supabaseToken);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // Rate limiting check
    const rateLimitCheck = await checkRateLimit(apiKey);
    if (!rateLimitCheck.allowed) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, rateLimitCheck.error);
      return res.status(429).json({
        success: false,
        error: rateLimitCheck.error,
        message: 'Rate limit exceeded'
      });
    }

    if (!fileUrl && !filename) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'MISSING_PARAMETERS');
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'Either fileUrl or filename is required'
      });
    }

    let targetFilename;
    let targetBucket = bucket;

    // Extract filename and bucket from URL if provided
    if (fileUrl) {
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split('/');
        targetFilename = pathParts[pathParts.length - 1];
        
        // Try to extract bucket from URL
        const bucketMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^\/]+)\//);
        if (bucketMatch) {
          targetBucket = bucketMatch[1];
        }
      } catch (error) {
        await updateSupabaseMetrics(apiKey, 'supabase', false, 'INVALID_URL');
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: 'Invalid file URL provided'
        });
      }
    } else {
      targetFilename = filename;
    }

    if (!targetFilename) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'INVALID_FILENAME');
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILENAME',
        message: 'Could not determine filename'
      });
    }

    console.log(`📁 Downloading file: ${targetFilename} from bucket: ${targetBucket}`);

    // Check bucket access
    const bucketAccess = await checkBucketAccess(targetBucket, apiKey, 'read', developerSupabase);
    if (!bucketAccess.hasAccess) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'BUCKET_ACCESS_DENIED');
      return res.status(403).json({
        success: false,
        error: 'BUCKET_ACCESS_DENIED',
        message: 'Bucket access denied',
        details: bucketAccess.details
      });
    }

    // Check if file exists
    const { data: fileExists, error: existsError } = await developerSupabase.storage
      .from(targetBucket)
      .download(targetFilename);

    if (existsError || !fileExists) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'FILE_NOT_FOUND');
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: 'File not found in storage',
        details: existsError?.message
      });
    }

    // Determine if bucket is public or private
    const isPublicBucket = targetBucket === SUPABASE_BUCKET; // Assuming main bucket is public
    const isPrivateBucket = targetBucket === PRIVATE_BUCKET || !isPublicBucket;

    let downloadUrl;
    let downloadMethod = 'direct';
    let expiresAt = null;

    if (isPrivateBucket) {
      // Generate signed download URL for private files
      const { data: signedUrlData, error: signedUrlError } = await developerSupabase.storage
        .from(targetBucket)
        .createSignedUrl(targetFilename, expiresIn);

      if (signedUrlError) {
        console.error('❌ Failed to generate signed download URL:', signedUrlError);
        await updateSupabaseMetrics(apiKey, 'supabase', false, 'SIGNED_URL_ERROR');
        return res.status(500).json({
          success: false,
          error: 'SIGNED_URL_ERROR',
          message: 'Failed to generate signed download URL',
          details: signedUrlError.message
        });
      }

      downloadUrl = signedUrlData.signedUrl;
      downloadMethod = 'signed_url';
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      
      console.log(`✅ Generated signed download URL (expires in ${expiresIn}s)`);
    } else {
      // Get direct public URL for public files
      const { data: urlData } = developerSupabase.storage
        .from(targetBucket)
        .getPublicUrl(targetFilename);
      
      downloadUrl = urlData.publicUrl;
      downloadMethod = 'direct';
      
      console.log(`✅ Generated direct public download URL`);
    }

    // Get file metadata
    const { data: fileList, error: listError } = await developerSupabase.storage
      .from(targetBucket)
      .list('', { search: targetFilename });

    const fileMetadata = fileList?.find(f => f.name === targetFilename);

    // Update metrics
    await updateSupabaseMetrics(apiKey, 'supabase', true, 'DOWNLOAD_SUCCESS', {
      fileSize: fileMetadata?.metadata?.size || 0
    });

    // Log download request
    await supabaseAdmin
      .from('download_logs')
      .insert({
        api_key_id: apiKey,
        provider: 'supabase',
        bucket: targetBucket,
        filename: targetFilename,
        download_url: downloadUrl,
        download_method: downloadMethod,
        expires_at: expiresAt,
        created_at: new Date().toISOString()
      });

    res.status(200).json({
      success: true,
      message: 'File download URL generated successfully',
      data: {
        filename: targetFilename,
        bucket: targetBucket,
        downloadUrl: downloadUrl,
        downloadMethod: downloadMethod,
        isPrivate: isPrivateBucket,
        expiresAt: expiresAt,
        expiresIn: isPrivateBucket ? expiresIn : null,
        fileSize: fileMetadata?.metadata?.size || 0,
        contentType: fileMetadata?.metadata?.mimetype || 'application/octet-stream',
        lastModified: fileMetadata?.updated_at,
        provider: 'supabase',
        instructions: {
          note: isPrivateBucket ? 
            'Use this signed URL to download the file directly' : 
            'Use this public URL to download the file directly',
          curlExample: `curl -o "${targetFilename}" "${downloadUrl}"`,
          browserExample: `window.open("${downloadUrl}", "_blank")`
        }
      }
    });

  } catch (error) {
    console.error('💥 Supabase Storage download error:', error);
    
    if (apiKey) {
      await updateSupabaseMetrics(apiKey, 'supabase', false, 'DOWNLOAD_SERVER_ERROR', { 
        errorDetails: error.message 
      });
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
 * Health check for Supabase Storage service
 */
export const checkSupabaseHealth = async (req, res) => {
  try {
    console.log('🏥 Checking Supabase Storage health...');
    
    const healthChecks = {
      storageConnection: false,
      databaseConnection: false,
      bucketAccess: false,
      uploadCapability: false,
      overall: false
    };

    const startTime = Date.now();

    // Test storage connection
    try {
      const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
      healthChecks.storageConnection = !error && Array.isArray(buckets);
    } catch (error) {
      console.error('Storage connection check failed:', error);
    }

    // Test database connection
    try {
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('id')
        .limit(1);
      healthChecks.databaseConnection = !error;
    } catch (error) {
      console.error('Database connection check failed:', error);
    }

    // Test bucket access
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .list('', { limit: 1 });
      healthChecks.bucketAccess = !error;
    } catch (error) {
      console.error('Bucket access check failed:', error);
    }

    // Test upload capability with small file
    try {
      const testFilename = `health_check_${Date.now()}.txt`;
      const testContent = Buffer.from('health check test');
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .upload(testFilename, testContent, {
          contentType: 'text/plain'
        });

      if (!uploadError) {
        // Clean up test file
        await supabaseAdmin.storage
          .from(SUPABASE_BUCKET)
          .remove([testFilename]);
        
        healthChecks.uploadCapability = true;
      }
    } catch (error) {
      console.error('Upload capability check failed:', error);
    }

    const responseTime = Date.now() - startTime;
    healthChecks.overall = Object.values(healthChecks).every(check => check === true);

    const status = healthChecks.overall ? 'healthy' : 'degraded';
    const statusCode = healthChecks.overall ? 200 : 503;

    res.status(statusCode).json({
      success: healthChecks.overall,
      status: status,
      message: `Supabase Storage is ${status}`,
      data: {
        provider: 'supabase',
        responseTime: responseTime,
        timestamp: new Date().toISOString(),
        checks: healthChecks,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    });

  } catch (error) {
    console.error('💥 Health check error:', error);

    res.status(500).json({
      success: false,
      status: 'unhealthy',
      message: 'Health check failed',
      data: {
        provider: 'supabase',
        timestamp: new Date().toISOString(),
        error: error.message
      }
    });
  }
};


/**
 * List available buckets for Supabase Storage
 */
export const listSupabaseBuckets = async (req, res) => {
  let apiKey;
  
  try {
    console.log('📋 Listing Supabase Storage buckets...');
    
    const { supabaseToken, supabaseUrl } = req.body;
    apiKey = req.apiKeyId;

    // Validate developer's Supabase credentials
    if (!supabaseToken) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_TOKEN',
        message: 'Supabase service key is required. Please provide your Supabase service role key.'
      });
    }

    if (!supabaseUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SUPABASE_URL',
        message: 'Supabase project URL is required. Please provide your Supabase project URL.'
      });
    }

    // Create Supabase client using developer's credentials
    const developerSupabase = createClient(supabaseUrl, supabaseToken);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    // List all buckets
    const { data: buckets, error: bucketsError } = await developerSupabase.storage.listBuckets();

    if (bucketsError) {
      console.error('❌ Failed to list buckets:', bucketsError);
      return res.status(500).json({
        success: false,
        error: 'BUCKETS_LIST_ERROR',
        message: 'Failed to list buckets',
        details: bucketsError.message
      });
    }

    // Get additional info for each bucket
    const bucketInfos = await Promise.all(
      buckets.map(async (bucket) => {
        try {
          // Get file count and total size
          const { data: files, error: filesError } = await developerSupabase.storage
            .from(bucket.name)
            .list('', { limit: 1000 }); // Get up to 1000 files for stats

          let fileCount = 0;
          let totalSize = 0;

          if (!filesError && files) {
            fileCount = files.length;
            // Calculate total size (approximate)
            totalSize = files.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
          }

          return {
            name: bucket.name,
            public: bucket.public,
            fileCount,
            totalSize,
            createdAt: bucket.created_at
          };
        } catch (error) {
          console.warn(`⚠️ Could not get stats for bucket ${bucket.name}:`, error.message);
          return {
            name: bucket.name,
            public: bucket.public,
            fileCount: 0,
            totalSize: 0,
            createdAt: bucket.created_at
          };
        }
      })
    );

    console.log(`✅ Listed ${bucketInfos.length} buckets successfully`);

    // Update metrics
    await updateSupabaseMetrics(apiKey, 'supabase', true, null, {
      operation: 'list_buckets',
      bucketCount: bucketInfos.length
    });

    res.json({
      success: true,
      data: bucketInfos,
      message: `Found ${bucketInfos.length} buckets`
    });

  } catch (error) {
    console.error('❌ Error listing buckets:', error);
    
    await updateSupabaseMetrics(apiKey, 'supabase', false, 'GENERAL_ERROR', {
      operation: 'list_buckets',
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'GENERAL_ERROR',
      message: 'Failed to list buckets',
      details: error.message
    });
  }
};