/**
 * Analytics tracking helper
 * Track upload events, completions, and failures to Supabase
 */

import { supabaseAdmin } from '../../../database/supabase.js';

/**
 * Log file upload to tracking tables
 * @param {Object} data - Upload data
 */
export const logFileUpload = async (data) => {
    const {
        apiKeyId,
        userId,
        provider,
        fileName,
        fileType,
        fileSize,
        uploadStatus,
        fileUrl = null,
        errorMessage = null
    } = data;

    try {
        // Insert into file_uploads table
        await supabaseAdmin
            .from('file_uploads')
            .insert({
                api_key_id: apiKeyId,
                user_id: userId,
                provider,
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
                provider,
                status_code: uploadStatus === 'success' ? 200 : 400,
                request_size_bytes: fileSize,
                response_size_bytes: uploadStatus === 'success' ? fileSize : 0,
                error_message: errorMessage,
                requested_at: new Date().toISOString()
            });

        console.log('✅ Analytics tracked for', fileName);
    } catch (error) {
        // Non-blocking - don't fail main operation if logging fails
        console.error('❌ Analytics tracking failed:', error.message);
    }
};

/**
 * Track upload initiation (non-blocking)
 * @param {Object} data 
 */
export const trackUploadInitiated = async (data) => {
    const { userId, apiKeyId, fileName, fileType, fileSize, provider } = data;

    try {
        await supabaseAdmin
            .from('upload_logs')
            .insert({
                user_id: userId,
                api_key_id: apiKeyId,
                file_name: fileName,
                original_name: fileName,
                file_type: fileType,
                file_size: fileSize || 0,
                status: 'initiated',
                provider,
                created_at: new Date().toISOString()
            });
    } catch (error) {
        console.error('Error logging upload initiation:', error.message);
    }
};

/**
 * Track upload completion
 * @param {Object} data 
 */
export const trackUploadCompleted = async (data) => {
    const { userId, apiKeyId, fileName, fileUrl, fileSize, provider } = data;

    try {
        await supabaseAdmin
            .from('upload_logs')
            .update({
                file_url: fileUrl,
                status: 'completed',
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('file_name', fileName);

        console.log('✅ Upload completion tracked');
    } catch (error) {
        console.error('Error tracking upload completion:', error.message);
    }
};

/**
 * Track upload failure
 * @param {Object} data 
 */
export const trackUploadFailed = async (data) => {
    const { userId, fileName, errorMessage } = data;

    try {
        await supabaseAdmin
            .from('upload_logs')
            .update({
                status: 'failed',
                error_message: errorMessage,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('file_name', fileName);
    } catch (error) {
        console.error('Error tracking upload failure:', error.message);
    }
};
