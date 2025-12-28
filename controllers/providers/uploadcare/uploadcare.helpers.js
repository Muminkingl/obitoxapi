/**
 * Uploadcare Storage Helper Functions
 * Shared utilities for validation, metrics, logging, and filename generation
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import {
    MAX_FILE_SIZE,
    ALLOWED_FILE_TYPES,
    UPLOADCARE_API_BASE,
    getUploadcareHeaders
} from './uploadcare.config.js';

/**
 * Log individual file upload to granular tracking tables
 */
export const logFileUpload = async (apiKeyId, userId, provider, fileName, fileType, fileSize, uploadStatus, fileUrl = null, errorMessage = null) => {
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
        console.error('Upload log error:', error);
    }
};

/**
 * Update file size for Uploadcare after getting file info
 */
export const updateUploadcareFileSize = async (apiKeyId, fileUuid, uploadcarePublicKey, uploadcareSecretKey) => {
    try {
        // Get file info from Uploadcare to get the actual file size
        const fileInfoResponse = await fetch(`${UPLOADCARE_API_BASE}/files/${fileUuid}/`, {
            method: 'GET',
            headers: getUploadcareHeaders(uploadcarePublicKey, uploadcareSecretKey)
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
        console.error('File size update error:', error);
    }
};

/**
 * Update request metrics for Uploadcare
 */
export const updateUploadcareMetrics = async (apiKeyId, userId, provider, status, fileSize = 0, fileType = null) => {
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
        console.error('Metrics update error:', error);
    }
};

/**
 * Comprehensive file validation for Uploadcare
 */
export const validateFileForUploadcare = (filename, contentType, fileSize = 0) => {
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
        errors.push(`Unsupported file type: ${contentType}`);
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
export const generateUploadcareFilename = (originalName, apiKey = null) => {
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
