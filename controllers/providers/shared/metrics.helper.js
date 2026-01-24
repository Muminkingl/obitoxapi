/**
 * Request Metrics Helper (OPTIMIZED with Redis)
 * 
 * 🚀 PERFORMANCE UPGRADE:
 * - OLD: 4 DB queries per request (SELECT + UPDATE api_keys, SELECT + UPSERT provider_usage)
 * - NEW: 0 DB queries per request (Redis increments, worker syncs every 5s)
 * 
 * Same function signature - no changes needed to callers!
 */

import {
    incrementApiKeyMetrics,
    incrementProviderMetrics,
    incrementDailyApiKeyMetrics,
    incrementDailyProviderMetrics
} from '../../../lib/metrics/redis-counters.js';

/**
 * Update request metrics for a provider (REDIS-BACKED)
 * 
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

        // 🚀 FAST: Increment counters in Redis (O(1) operation)
        // Worker syncs to DB every 5 seconds

        // Update API key metrics
        await incrementApiKeyMetrics(apiKeyId, {
            total_requests: 1,
            successful_requests: success ? 1 : 0,
            failed_requests: success ? 0 : 1,
            total_file_size: success ? (additionalData.fileSize || 0) : 0,
            total_files_uploaded: success ? 1 : 0
        });

        // Update provider usage
        if (provider) {
            await incrementProviderMetrics(apiKeyId, userId, provider, {
                upload_count: success ? 1 : 0,
                total_file_size: success ? (additionalData.fileSize || 0) : 0
            });
        }

        // 📅 DAILY ANALYTICS: Also increment daily counters for historical tracking
        // These get rolled up to daily tables at midnight UTC
        await incrementDailyApiKeyMetrics(apiKeyId, userId, {
            total_requests: 1,
            successful_requests: success ? 1 : 0,
            failed_requests: success ? 0 : 1,
            total_file_size: success ? (additionalData.fileSize || 0) : 0,
            total_files_uploaded: success ? 1 : 0
        });

        if (provider) {
            await incrementDailyProviderMetrics(apiKeyId, userId, provider, {
                upload_count: success ? 1 : 0,
                total_file_size: success ? (additionalData.fileSize || 0) : 0
            });
        }

    } catch (error) {
        console.error('[Metrics] ❌ Error updating metrics:', error.message);
        // Don't throw - metrics are non-critical
    }
};

/**
 * Update provider-specific usage statistics (REDIS-BACKED)
 * 
 * @param {string} apiKeyId 
 * @param {string} provider 
 * @param {boolean} success 
 * @param {Object} additionalData 
 */
export const updateProviderUsage = async (apiKeyId, userId, provider, success, additionalData = {}) => {
    try {
        if (!apiKeyId || !provider) return;

        // 🚀 FAST: Increment counters in Redis
        await incrementProviderMetrics(apiKeyId, userId, provider, {
            upload_count: success ? 1 : 0,
            total_file_size: success ? (additionalData.fileSize || 0) : 0
        });

    } catch (error) {
        console.error('[Metrics] ❌ Error updating provider usage:', error.message);
    }
};

// ✅ OPTIMIZED: All DB writes now go through Redis + background worker
// See: jobs/metrics-worker.js for the sync logic
