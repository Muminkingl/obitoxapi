/**
 * NEW Analytics & Quota Helper
 * Implements the new schema tracking logic:
 * 1. Quota Check (can_make_request)
 * 2. Usage Increment (increment_request_count)
 * 
 * NOTE: API usage is tracked via Redis metrics in provider_usage and api_keys tables.
 * Audit logs are reserved for low-volume security/billing events only (rate limits, bans, etc.)
 */

import { supabaseAdmin } from '../../../database/supabase.js';
// NOTE: logAudit removed - API usage should NOT go to audit_logs (high volume)

/**
 * Check if a user has sufficient quota to make a request
 * Uses the database RPC function `can_make_request`
 * 
 * @param {string} userId - The user ID to check
 * @returns {Promise<{allowed: boolean, error?: string}>}
 */
export const checkUserQuota = async (userId) => {
    try {
        if (!userId) {
            return { allowed: false, error: 'User ID required for quota check' };
        }

        const { data: allowed, error } = await supabaseAdmin
            .rpc('can_make_request', { p_user_id: userId });

        if (error) {
            console.error('❌ Quota check error:', error);
            return { allowed: false, error: error.message };
        }

        return { allowed: !!allowed };
    } catch (err) {
        console.error('❌ Quota check exception:', err);
        return { allowed: false, error: err.message };
    }
};

/**
 * Track API usage - Increments user's request count via RPC
 * 
 * NOTE: This ONLY increments the quota counter. API usage metrics are tracked
 * separately via Redis in provider_usage and api_keys tables (metrics.helper.js).
 * Audit logs are NOT used for API usage (too high volume).
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.endpoint - API Endpoint (for logging only)
 * @param {string} params.method - HTTP Method (for logging only)
 * @param {string} params.provider - 'r2', 'vercel', 's3', etc.
 * @param {string} params.operation - 'signed-url', 'upload', 'delete', 'list'
 * @param {number} params.statusCode - HTTP Status Code
 * @param {boolean} params.success - Whether request succeeded
 * @param {number} [params.requestCount=1] - Number of requests
 * @param {string} [params.apiKeyId] - Optional API Key ID
 * @param {string} [params.ipAddress] - Request IP
 * @param {string} [params.userAgent] - Request User Agent
 */
export const trackApiUsage = async ({
    userId,
    endpoint,
    method,
    provider,
    operation,
    statusCode,
    success,
    requestCount = 1,
    apiKeyId = null,
    ipAddress = null,
    userAgent = null
}) => {
    try {
        // Increment usage counter (for real-time quota tracking)
        if (userId) {
            const { error: rpcError } = await supabaseAdmin
                .rpc('increment_request_count', {
                    p_user_id: userId,
                    p_count: requestCount
                });

            if (rpcError) console.error('❌ Failed to increment usage:', rpcError);
        }

        // NOTE: API usage metrics are tracked via Redis in:
        // - provider_usage table (via metrics.helper.js → incrementProviderMetrics)
        // - api_keys table (via metrics.helper.js → incrementApiKeyMetrics)
        // 
        // Audit logs are ONLY for low-volume security/billing events:
        // - rate_limit_exceeded, rate_limit_ban_applied, rate_limit_ban_expired
        // - usage_warning_50_percent, usage_warning_80_percent, usage_limit_reached
        // - api_key_created, api_key_deleted, permanent_ban_applied, etc.

    } catch (err) {
        console.error('❌ Track API usage exception:', err);
    }
};

