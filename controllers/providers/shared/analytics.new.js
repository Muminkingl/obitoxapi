/**
 * NEW Analytics & Quota Helper
 * 
 * 🚀 OPTIMIZED: Uses Redis-only quota check (NO database RPC!)
 * 
 * Before: checkUserQuota → Supabase RPC (~50-100ms)
 * After:  checkUserQuota → Redis GET (~1-5ms)
 */

import { checkQuota, MONTHLY_QUOTAS } from '../../../utils/quota-manager.js';
import { getUserTierCached } from '../../../utils/tier-cache.js';

/**
 * Check if a user has sufficient quota to make a request
 * 🚀 OPTIMIZED: Uses Redis instead of database RPC!
 * 
 * @param {string} userId - The user ID to check
 * @returns {Promise<{allowed: boolean, error?: string}>}
 */
export const checkUserQuota = async (userId) => {
    try {
        if (!userId) {
            return { allowed: false, error: 'User ID required for quota check' };
        }

        // 🚀 Get tier from Redis cache (NOT database!)
        const tierData = await getUserTierCached(userId);
        const tier = tierData.tier || 'free';

        // 🚀 Check quota from Redis (NOT database RPC!)
        const quotaResult = await checkQuota(userId, tier);

        return {
            allowed: quotaResult.allowed,
            current: quotaResult.current,
            limit: quotaResult.limit,
            percentage: quotaResult.percentage,
            tier
        };
    } catch (err) {
        console.error('❌ Quota check exception:', err.message);
        // Fail open - allow request if Redis fails
        return { allowed: true, error: err.message };
    }
};

/**
 * Track API usage - DEPRECATED
 * 
 * ⚠️ This function is now a NO-OP!
 * 
 * Metrics are tracked via updateRequestMetrics() in metrics.helper.js
 * which uses Redis counters instead of database writes.
 * 
 * The old RPC `increment_request_count` is no longer needed because:
 * 1. Quota is tracked via Redis in quota-manager.js (incrementQuota)
 * 2. Metrics are tracked via Redis in redis-counters.js (updateRequestMetrics)
 * 3. Daily rollup syncs Redis → Database once per day
 * 
 * @deprecated Use updateRequestMetrics() instead
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
    // 🚀 NO-OP: All tracking now done via Redis in updateRequestMetrics()
    // This eliminates the database RPC call that was adding ~50-100ms latency

    // NOTE: If you still need to call the database RPC for some reason,
    // uncomment the code below. But this should NOT be needed.

    /*
    try {
        if (userId) {
            const { error: rpcError } = await supabaseAdmin
                .rpc('increment_request_count', {
                    p_user_id: userId,
                    p_count: requestCount
                });
            if (rpcError) console.error('❌ Failed to increment usage:', rpcError);
        }
    } catch (err) {
        console.error('❌ Track API usage exception:', err);
    }
    */
};
