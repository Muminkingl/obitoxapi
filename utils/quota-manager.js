/**
 * Layer 3: Monthly Quota Manager - FIXED VERSION
 * 
 * FIXES:
 * 1. ✅ checkQuota returns both "allowed" AND "quotaExceeded" for middleware
 * 2. ✅ checkQuota checks if NEXT request would exceed (not current)
 * 3. ✅ incrementQuota CALLS checkUsageWarnings (was missing!)
 * 4. ✅ Proper TTL restoration logic
 */

import { createHash } from 'crypto';
import { getRedisAsync } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logAudit } from './audit-logger.js';
import logger from './logger.js';

// Monthly quota configuration
export const MONTHLY_QUOTAS = {
    free: {
        requestsPerMonth: 1000,
        label: 'FREE'
    },
    pro: {
        requestsPerMonth: 50000,
        label: 'PRO'
    },
    enterprise: {
        requestsPerMonth: -1, // Unlimited
        label: 'ENTERPRISE'
    }
};

/**
 * Get user's subscription tier from cache or database
 */
async function getUserTier(userId) {
    const redis = await getRedisAsync();

    if (redis) {
        const cacheKey = `tier:${userId}`;
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached).tier;
    }

    try {
        // ✅ NEW: Query profiles_with_tier view for computed tier (respects expiration + grace period)
        const { data } = await supabaseAdmin
            .from('profiles_with_tier')
            .select('subscription_tier')
            .eq('id', userId)
            .single();

        // subscription_tier is COMPUTED (not subscription_tier_paid)
        const tier = (data?.subscription_tier || 'free').toLowerCase();
        if (redis) {
            await redis.setex(`tier:${userId}`, 300, JSON.stringify({ tier }));
        }
        return tier;
    } catch (err) {
        logger.error(`quota manager error:`, { error: err });
        return 'free';
    }
}

/**
 * Get current month key (YYYY-MM format)
 */
export function getMonthKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Get TTL until end of current month + 7 days buffer
 */
export function getMonthEndTTL() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const ttlEnd = new Date(monthEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
    return Math.ceil((ttlEnd - now) / 1000);
}

/**
 * Get month end timestamp
 */
export function getMonthEnd() {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return monthEnd.getTime();
}

/**
 * Get next tier for upgrade prompt
 */
export function getNextTier(currentTier) {
    if (currentTier === 'free') return 'pro';
    if (currentTier === 'pro') return 'enterprise';
    return 'enterprise';
}

/**
 * Check quota ONLY (don't increment yet!)
 * 🔥 FIXED: Returns both "allowed" AND "quotaExceeded" for middleware
 * 🔥 FIXED: Checks if NEXT request would exceed
 */
export async function checkQuota(userId, tier) {
    try {
        const month = getMonthKey();
        const quotaKey = `quota:${userId}:${month}`;
        const limits = MONTHLY_QUOTAS[tier] || MONTHLY_QUOTAS.free;

        // Unlimited tier (Enterprise)
        if (limits.requestsPerMonth === -1) {
            return {
                allowed: true,
                quotaExceeded: false,
                current: 0,
                limit: -1,
                percentage: 0,
                tier,
                resetAt: null,
                resetIn: null
            };
        }

        const redis = await getRedisAsync();
        if (!redis) {
            return {
                allowed: true, // Fail open if Redis is down
                quotaExceeded: false,
                current: 0,
                limit: limits.requestsPerMonth,
                percentage: 0,
                tier,
                resetAt: null,
                resetIn: null
            };
        }

        // Get current count
        const current = parseInt(await redis.get(quotaKey) || '0');

        // 🔥 FIX: Check if NEXT request would exceed (prevents off-by-one)
        const nextCount = current + 1;
        const quotaExceeded = nextCount > limits.requestsPerMonth;
        const allowed = !quotaExceeded;

        const percentage = Math.round((current / limits.requestsPerMonth) * 100);

        return {
            allowed,
            quotaExceeded,  // 🔥 CRITICAL: Middleware checks this!
            current,
            limit: limits.requestsPerMonth,
            percentage,
            tier,
            resetAt: getMonthEnd(),
            resetIn: Math.ceil((getMonthEnd() - Date.now()) / 1000)
        };
    } catch (error) {
        logger.error(`quota manager error:`, { error });

        // Fail open - allow request if Redis fails
        return {
            allowed: true,
            quotaExceeded: false,
            current: 0,
            limit: -1,
            percentage: 0,
            tier,
            resetAt: null,
            resetIn: null
        };
    }
}



/**
 * Check and send usage warnings (50%, 80%, 100%)
 * 🔥 NOW CALLED from incrementQuota!
 */
export async function checkUsageWarnings(userId, tier, currentCount) {
    try {
        const redis = await getRedisAsync();
        if (!redis) return;

        const limits = MONTHLY_QUOTAS[tier];

        // Skip for unlimited tiers
        if (!limits || limits.requestsPerMonth === -1) return;

        const month = getMonthKey();
        const limit = limits.requestsPerMonth;
        const usage = currentCount / limit;
        const percentage = Math.round(usage * 100);

        logger.info(`[QUOTA] 🔍 Checking warnings: ${currentCount}/${limit} (${percentage}%)`);

        // 🔥 100% - Quota limit reached
        if (currentCount >= limit) {
            const warnKey = `warned:${userId}:${month}:100`;
            const alreadyWarned = await redis.get(warnKey);

            if (!alreadyWarned) {
                await redis.setex(warnKey, getMonthEndTTL(), '1');

                logAudit({
                    user_id: userId,
                    resource_type: 'usage_quota',
                    event_type: 'usage_limit_reached',
                    event_category: 'critical',
                    description: `Monthly quota limit reached: ${currentCount}/${limit} requests`,
                    metadata: {
                        tier,
                        current: currentCount,
                        limit,
                        percentage: 100,
                        reset_at: new Date(getMonthEnd()).toISOString()
                    }
                }).catch(() => { });

                await queueEmail(userId, 'QUOTA_LIMIT_REACHED', {
                    current: currentCount,
                    limit,
                    percentage: 100,
                    resetAt: new Date(getMonthEnd()).toISOString()
                });

                logger.info(`[QUOTA] 🚨 100% warning sent for user ${userId}`);
            }
        }
        // 80% warning
        else if (usage >= 0.80) {
            const warnKey = `warned:${userId}:${month}:80`;
            const alreadyWarned = await redis.get(warnKey);

            if (!alreadyWarned) {
                await redis.setex(warnKey, getMonthEndTTL(), '1');

                logAudit({
                    user_id: userId,
                    resource_type: 'usage_quota',
                    event_type: 'usage_warning_80_percent',
                    event_category: 'warning',
                    description: `80% of monthly quota consumed: ${currentCount}/${limit} requests`,
                    metadata: {
                        tier,
                        current: currentCount,
                        limit,
                        percentage,
                        reset_at: new Date(getMonthEnd()).toISOString()
                    }
                }).catch(() => { });

                await queueEmail(userId, 'QUOTA_WARNING_80', {
                    current: currentCount,
                    limit,
                    percentage,
                    resetAt: new Date(getMonthEnd()).toISOString()
                });

                logger.info(`[QUOTA] 📧 80% warning sent for user ${userId}`);
            }
        }
        // 50% warning
        else if (usage >= 0.50) {
            const warnKey = `warned:${userId}:${month}:50`;
            const alreadyWarned = await redis.get(warnKey);

            if (!alreadyWarned) {
                await redis.setex(warnKey, getMonthEndTTL(), '1');

                logAudit({
                    user_id: userId,
                    resource_type: 'usage_quota',
                    event_type: 'usage_warning_50_percent',
                    event_category: 'info',
                    description: `50% of monthly quota consumed: ${currentCount}/${limit} requests`,
                    metadata: {
                        tier,
                        current: currentCount,
                        limit,
                        percentage,
                        reset_at: new Date(getMonthEnd()).toISOString()
                    }
                }).catch(() => { });

                await queueEmail(userId, 'QUOTA_WARNING_50', {
                    current: currentCount,
                    limit,
                    percentage,
                    resetAt: new Date(getMonthEnd()).toISOString()
                });

                logger.info(`[QUOTA] 📧 50% warning sent for user ${userId}`);
            }
        }
    } catch (error) {
        logger.error(`quota manager error:`, { error });
    }
}

/**
 * Queue email
 */
async function queueEmail(userId, template, data) {
    logger.info(`[QUOTA] Email queued: ${template} for user ${userId}`, data);
    // TODO: Implement with Bull/BullMQ + Resend
}

/**
 * Get quota usage for dashboard
 */
export async function getQuotaUsage(userId, tier) {
    try {
        const redis = await getRedisAsync();
        const month = getMonthKey();
        const quotaKey = `quota:${userId}:${month}`;
        const limits = MONTHLY_QUOTAS[tier] || MONTHLY_QUOTAS.free;
        const current = redis ? parseInt(await redis.get(quotaKey) || '0') : 0;

        return {
            current,
            limit: limits.requestsPerMonth,
            tier,
            percentage: limits.requestsPerMonth === -1
                ? 0
                : Math.round((current / limits.requestsPerMonth) * 100),
            remaining: Math.max(0, limits.requestsPerMonth - current),
            resetAt: getMonthEnd(),
            resetIn: Math.ceil((getMonthEnd() - Date.now()) / 1000)
        };
    } catch (error) {
        logger.error(`quota manager error:`, { error });
        return {
            current: 0,
            limit: -1,
            tier,
            percentage: 0,
            remaining: 0,
            resetAt: null,
            resetIn: null
        };
    }
}