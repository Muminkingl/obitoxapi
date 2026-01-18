/**
 * NEW Analytics & Quota Helper
 * Implements the new schema tracking logic:
 * 1. Quota Check (can_make_request)
 * 2. Usage Increment (increment_request_count)
 * 3. Central Logging (api_usage_logs)
 */

import { supabaseAdmin } from '../../../database/supabase.js';

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
            // If no user ID (e.g. public access if allowed, or error), default to allow strictly to avoid blocking valid flows if auth fails elsewhere
            // BUT for this system, userId is required for quota.
            return { allowed: false, error: 'User ID required for quota check' };
        }

        const { data: allowed, error } = await supabaseAdmin
            .rpc('can_make_request', { p_user_id: userId });

        if (error) {
            console.error('❌ Quota check error:', error);
            // Fail open or closed? For billing, usually fail closed, but for UX, maybe fail open?
            // Let's fail closed to prevent abuse if DB is acting up, but log heavily.
            return { allowed: false, error: error.message };
        }

        return { allowed: !!allowed };
    } catch (err) {
        console.error('❌ Quota check exception:', err);
        return { allowed: false, error: err.message };
    }
};

/**
 * Track API usage
 * 1. Increments user's request count via RPC
 * 2. Logs detailed entry to api_usage_logs
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.endpoint - API Endpoint (e.g. '/api/v1/upload/r2/signed-url')
 * @param {string} params.method - HTTP Method (POST, DELETE, etc.)
 * @param {string} params.provider - 'r2', 'vercel', 'supabase', 'uploadcare'
 * @param {string} params.operation - 'signed-url', 'upload', 'delete', 'list'
 * @param {number} params.statusCode - HTTP Status Code
 * @param {boolean} params.success - Whether requests succeeded
 * @param {number} [params.requestCount=1] - Number of requests to count (for batch)
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
        // 1. Increment usage counter (Fire & Forget mostly, but we await to ensure it happens)
        // Only increment if it counts as usage (usually success or specific failures)
        // For now, let's count all attempts that reach this stage as usage if we want to be strict,
        // OR only success. Plans usually count *requests*, so even failures might count if they consume resources.
        // However, `increment_request_count` simply adds. Let's assume we count everything for now,
        // or maybe only successful ones? Re-reading planss.md: "1 signed URL = 1 request".
        // Usually we count successful generation.

        if (userId) {
            const { error: rpcError } = await supabaseAdmin
                .rpc('increment_request_count', {
                    p_user_id: userId,
                    p_count: requestCount
                });

            if (rpcError) console.error('❌ Failed to increment usage:', rpcError);
        }

        // 2. Log to api_usage_logs
        const { error: logError } = await supabaseAdmin
            .from('api_usage_logs')
            .insert({
                user_id: userId,
                endpoint,
                method,
                provider: provider ? provider.toLowerCase() : null,
                operation,
                status_code: statusCode,
                success,
                request_count: requestCount,
                api_key_id: apiKeyId,
                ip_address: ipAddress,
                user_agent: userAgent,
                created_at: new Date().toISOString()
            });

        if (logError) console.error('❌ Failed to log usage:', logError);

    } catch (err) {
        console.error('❌ Track API usage exception:', err);
    }
};
