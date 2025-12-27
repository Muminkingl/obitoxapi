/**
 * Request metrics helper
 * Update API key usage metrics and provider statistics
 */

import { supabaseAdmin } from '../../../database/supabase.js';

/**
 * Update request metrics for a provider
 * @param {string} apiKeyId 
 * @param {string} userId 
 * @param {string} provider 
 * @param {boolean} success 
 * @param {Object} additionalData 
 */
export const updateRequestMetrics = async (apiKeyId, userId, provider, success, additionalData = {}) => {
    try {
        if (!apiKeyId) {
            console.warn('⚠️ No API key provided for metrics update');
            return;
        }

        // Get current values
        const { data: currentData, error: fetchError } = await supabaseAdmin
            .from('api_keys')
            .select('total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded')
            .eq('id', apiKeyId)
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

        // Update metrics
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
            .eq('id', apiKeyId);

        // Update provider usage
        await updateProviderUsage(apiKeyId, provider, success, additionalData);

    } catch (error) {
        console.error('Error updating request metrics:', error.message);
    }
};

/**
 * Update provider-specific usage statistics
 * @param {string} apiKeyId 
 * @param {string} provider 
 * @param {boolean} success 
 * @param {Object} additionalData 
 */
export const updateProviderUsage = async (apiKeyId, provider, success, additionalData = {}) => {
    try {
        const { data: providerData } = await supabaseAdmin
            .from('provider_usage')
            .select('upload_count, total_file_size')
            .eq('api_key_id', apiKeyId)
            .eq('provider', provider)
            .single();

        const currentCount = providerData?.upload_count || 0;
        const currentSize = providerData?.total_file_size || 0;

        if (providerData) {
            // Update existing
            await supabaseAdmin
                .from('provider_usage')
                .update({
                    upload_count: success ? currentCount + 1 : currentCount,
                    total_file_size: success ? currentSize + (additionalData.fileSize || 0) : currentSize,
                    last_used_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('api_key_id', apiKeyId)
                .eq('provider', provider);
        } else if (success) {
            // Insert new
            await supabaseAdmin
                .from('provider_usage')
                .insert({
                    api_key_id: apiKeyId,
                    provider,
                    upload_count: 1,
                    total_file_size: additionalData.fileSize || 0,
                    last_used_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
        }
    } catch (error) {
        console.error('Error updating provider usage:', error.message);
    }
};

/**
 * Increment daily usage count
 * @param {string} userId 
 * @param {string} provider 
 */
export const incrementDailyUsage = async (userId, provider) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        await supabaseAdmin
            .from('daily_usage')
            .upsert({
                user_id: userId,
                provider,
                date: today,
                request_count: 1
            }, {
                onConflict: 'user_id,provider,date',
                ignoreDuplicates: false
            });
    } catch (error) {
        console.error('Error incrementing daily usage:', error.message);
    }
};
