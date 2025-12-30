/**
 * Cloudflare R2 Helper Functions
 * Shared utilities for metrics tracking, logging, and validation
 * Following Rule #9: Track EXACT same metrics as other providers
 */

import { supabaseAdmin } from '../../../config/supabase.js';

/**
 * Update request metrics for R2 (NON-BLOCKING)
 * Following Rule #6: NO blocking database writes
 * Following Rule #9: Same metrics as Vercel/Supabase/Uploadcare
 * 
 * @param {string} apiKeyId - API key ID
 * @param {string} userId - User ID
 * @param {string} provider - Provider name ('r2')
 * @param {string} status - 'success' or 'failed'
 * @param {number} fileSize - File size in bytes
 * @param {string} fileType - MIME type
 */
export const updateR2Metrics = async (apiKeyId, userId, provider, status, fileSize = 0, fileType = null) => {
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

        // Update provider usage (SAME table as other providers)
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
        console.error('R2 metrics update error:', error);
    }
};

/**
 * Log individual file upload to granular tracking tables (NON-BLOCKING)
 * 
 * @param {string} apiKeyId - API key ID
 * @param {string} userId - User ID
 * @param {string} provider - Provider name ('r2')
 * @param {string} fileName - File name
 * @param {string} fileType - MIME type
 * @param {number} fileSize - File size in bytes
 * @param {string} uploadStatus - 'success' or 'failed'
 * @param {string} fileUrl - Public file URL
 * @param {string} errorMessage - Error message if failed
 */
export const logR2Upload = async (apiKeyId, userId, provider, fileName, fileType, fileSize, uploadStatus, fileUrl = null, errorMessage = null) => {
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
        console.error('R2 upload log error:', error);
    }
};

/**
 * Generate a secure unique filename for R2
 * Pattern: {apiKeyPrefix}_{sanitizedName}_{timestamp}_{random}.{ext}
 * 
 * @param {string} originalName - Original filename
 * @param {string} apiKey - API key (optional)
 * @returns {string} Unique filename
 */
export const generateR2Filename = (originalName, apiKey = null) => {
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
 * Validate file for R2 upload
 * 
 * @param {string} filename - File name
 * @param {string} contentType - MIME type
 * @param {number} fileSize - File size in bytes
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export const validateR2File = (filename, contentType, fileSize = 0) => {
    const errors = [];

    // Filename validation
    if (!filename || filename.trim() === '') {
        errors.push('Filename cannot be empty');
    } else if (filename.length > 255) {
        errors.push('Filename too long (max 255 characters)');
    }

    // File extension validation
    const hasExtension = filename && filename.includes('.');
    if (!hasExtension) {
        errors.push('File must have an extension');
    }

    // Content type validation
    if (!contentType) {
        errors.push('Content type is required');
    }

    // File size validation (5GB R2 limit)
    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
    if (fileSize > MAX_SIZE) {
        errors.push(`File too large. Maximum size: 5GB`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};
