/**
 * Supabase Storage Helper Functions
 * Provider-specific utilities for bucket access, rate limiting, quotas, validation
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import crypto from 'crypto';
import {
    SUPABASE_BUCKET,
    PRIVATE_BUCKET,
    MAX_FILES_PER_USER,
    MAX_TOTAL_SIZE_PER_USER,
    RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_PER_HOUR,
    ALLOWED_FILE_TYPES,
    DANGEROUS_FILE_TYPES,
    DANGEROUS_EXTENSIONS,
    MIN_FILE_SIZE,
    FILE_TYPE_LIMITS,
    getMaxAllowedSize,
    VALID_FILE_SIGNATURES
} from './supabase.config.js';

/**
 * Check if bucket exists and user has access
 */
export const checkBucketAccess = async (bucketName, apiKey, operation = 'read', developerSupabase = null) => {
    try {
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

        // For developer's Supabase client, assume they have access
        if (developerSupabase) {
            if (bucket.file_size_limit && operation === 'write') {
                return {
                    hasAccess: true,
                    bucket,
                    fileSizeLimit: bucket.file_size_limit,
                    isPublic: bucket.public
                };
            }
            return { hasAccess: true, bucket, isPublic: bucket.public };
        }

        // Check bucket policies (admin client only)
        if (bucket.public === false && operation === 'read' && !developerSupabase) {
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
                return { hasAccess: false, error: 'BUCKET_READ_DENIED', details: 'Read access denied' };
            }
        }

        if (bucket.file_size_limit && operation === 'write') {
            return {
                hasAccess: true,
                bucket,
                fileSizeLimit: bucket.file_size_limit,
                isPublic: bucket.public
            };
        }

        return { hasAccess: true, bucket, isPublic: bucket.public };
    } catch (error) {
        return { hasAccess: false, error: 'BUCKET_CHECK_ERROR', details: error.message };
    }
};

/**
 * Check rate limiting
 */
export const checkRateLimit = async (apiKey) => {
    try {
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        // Check minute limit
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

        // Check hour limit
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

        // Log request
        await supabaseAdmin
            .from('request_logs')
            .insert({
                api_key_id: apiKey,
                endpoint: 'supabase-storage',
                created_at: now.toISOString()
            })
            .then(() => { })
            .catch(err => console.error('Request log error:', err));

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
 * Check user quota
 */
export const checkUserQuota = async (apiKey, fileSize = 0) => {
    try {
        const { data: usage, error } = await supabaseAdmin
            .from('provider_usage')
            .select('upload_count, total_file_size')
            .eq('api_key_id', apiKey)
            .eq('provider', 'supabase')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Quota check error:', error);
            return { allowed: true, remaining: { files: MAX_FILES_PER_USER, size: MAX_TOTAL_SIZE_PER_USER } };
        }

        const currentFiles = usage?.upload_count || 0;
        const currentSize = usage?.total_file_size || 0;
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
 * Validate Supabase file
 */
export const validateSupabaseFile = async (file, apiKey, bucketName = SUPABASE_BUCKET) => {
    const errors = [];
    const warnings = [];

    if (!file) {
        errors.push('File is required');
        return { isValid: false, errors, warnings };
    }

    // Basic validation
    if (!file.name || file.name.trim() === '') {
        errors.push('Filename is required');
    }

    if (!file.size || file.size === 0) {
        errors.push('File size cannot be zero');
    }

    if (file.size < MIN_FILE_SIZE) {
        errors.push(`File size must be at least ${MIN_FILE_SIZE} bytes`);
    }

    // Check extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension) {
        errors.push('File must have an extension');
    }

    if (extension && DANGEROUS_EXTENSIONS.includes(extension)) {
        errors.push(`File type .${extension} is not allowed for security reasons`);
    }

    // Check MIME type
    if (!file.type) {
        warnings.push('File MIME type is not specified');
    } else {
        if (DANGEROUS_FILE_TYPES.some(dangerous => file.type.includes(dangerous))) {
            errors.push(`File type ${file.type} is not allowed for security reasons`);
        }

        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
            errors.push(`File type ${file.type} is not allowed`);
        }
    }

    // Size check
    const maxAllowedSize = getMaxAllowedSize(file.type);
    if (file.size > maxAllowedSize) {
        errors.push(`File size exceeds ${maxAllowedSize / (1024 * 1024)}MB limit for ${file.type || 'this file type'}`);
    }

    // Filename validation
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(file.name)) {
        errors.push('Filename contains invalid characters');
    }

    if (file.name.length > 255) {
        errors.push('Filename is too long (max 255 characters)');
    }

    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
        errors.push('Filename cannot contain path separators');
    }

    // Bucket access check
    const bucketAccess = await checkBucketAccess(bucketName, apiKey, 'write');
    if (!bucketAccess.hasAccess) {
        errors.push(`Bucket access error: ${bucketAccess.details}`);
    } else if (bucketAccess.fileSizeLimit && file.size > bucketAccess.fileSizeLimit) {
        errors.push(`File size exceeds bucket limit of ${bucketAccess.fileSizeLimit / (1024 * 1024)}MB`);
    }

    // Quota check
    const quotaCheck = await checkUserQuota(apiKey, file.size);
    if (!quotaCheck.allowed) {
        errors.push(`Quota exceeded: ${quotaCheck.details}`);
    }

    // File signature validation (if data provided)
    if (file.data) {
        try {
            const buffer = Buffer.from(file.data, 'base64');
            if (buffer.length !== file.size) {
                warnings.push('File size mismatch between metadata and actual data');
            }

            const fileSignature = buffer.slice(0, 4).toString('hex').toUpperCase();
            const detectedType = VALID_FILE_SIGNATURES[fileSignature];
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
 * Generate unique Supabase filename
 */
export const generateSupabaseFilename = (originalName, apiKey = null) => {
    try {
        const timestamp = Date.now();
        const randomBytes = crypto.randomBytes(8).toString('hex');
        const extension = originalName.split('.').pop()?.toLowerCase() || 'bin';

        const baseName = originalName
            .split('.')[0]
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 50);

        const keyPrefix = apiKey ? apiKey.substring(0, 8) : 'unknown';

        return `${keyPrefix}_${baseName}_${timestamp}_${randomBytes}.${extension}`;
    } catch (error) {
        console.error('Error generating filename:', error);
        return `file_${Date.now()}.bin`;
    }
};

/**
 * Update Supabase metrics
 */
export const updateSupabaseMetrics = async (apiKey, provider, success, errorType = null, additionalData = {}) => {
    try {
        if (!apiKey) {
            console.warn('⚠️ No API key provided for metrics update');
            return;
        }

        // Get current values
        const { data: currentData, error: fetchError } = await supabaseAdmin
            .from('api_keys')
            .select('total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded')
            .eq('id', apiKey)
            .single();

        if (fetchError) {
            console.error('❌ Error fetching current metrics:', fetchError);
            return;
        }

        const currentTotal = currentData?.total_requests || 0;
        const currentSuccess = currentData?.successful_requests || 0;
        const currentFailed = currentData?.failed_requests || 0;
        const currentFileSize = currentData?.total_file_size || 0;
        const currentFileCount = currentData?.total_files_uploaded || 0;

        // Update api_keys table
        await supabaseAdmin
            .from('api_keys')
            .update({
                total_requests: currentTotal + 1,
                successful_requests: success ? currentSuccess + 1 : currentSuccess,
                failed_requests: success ? currentFailed : currentFailed + 1,
                total_file_size: success ? currentFileSize + (additionalData.fileSize || 0) : currentFileSize,
                total_files_uploaded: success ? currentFileCount + 1 : currentFileCount,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', apiKey)
            .then(() => { })
            .catch(err => console.error('Metrics update error:', err));

        // Update provider usage
        const { data: providerData, error: providerError } = await supabaseAdmin
            .from('provider_usage')
            .select('upload_count, total_file_size')
            .eq('api_key_id', apiKey)
            .eq('provider', provider)
            .single();

        if (providerError && providerError.code !== 'PGRST116') {
            console.error('❌ Error fetching provider metrics:', providerError);
        } else if (providerError?.code === 'PGRST116') {
            // Insert new record
            await supabaseAdmin
                .from('provider_usage')
                .insert({
                    api_key_id: apiKey,
                    provider,
                    upload_count: success ? 1 : 0,
                    total_file_size: success ? additionalData.fileSize || 0 : 0,
                    last_used_at: success ? new Date().toISOString() : null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .then(() => { })
                .catch(err => console.error('Provider insert error:', err));
        } else {
            // Update existing
            const currentCount = providerData?.upload_count || 0;
            const currentSize = providerData?.total_file_size || 0;

            await supabaseAdmin
                .from('provider_usage')
                .update({
                    upload_count: success ? currentCount + 1 : currentCount,
                    total_file_size: success ? currentSize + (additionalData.fileSize || 0) : currentSize,
                    last_used_at: success ? new Date().toISOString() : providerData.last_used_at,
                    updated_at: new Date().toISOString()
                })
                .eq('api_key_id', apiKey)
                .eq('provider', provider)
                .then(() => { })
                .catch(err => console.error('Provider update error:', err));
        }

        // Log errors
        if (!success && errorType) {
            await supabaseAdmin
                .from('error_logs')
                .insert({
                    api_key_id: apiKey,
                    provider,
                    error_type: errorType,
                    error_details: additionalData,
                    created_at: new Date().toISOString()
                })
                .then(() => { })
                .catch(err => console.error('Error log insert error:', err));
        }

    } catch (error) {
        console.error('Error updating metrics:', error);
    }
};
