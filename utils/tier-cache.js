/**
 * TIER CACHING UTILITIES
 * 
 * Caches user subscription tiers in Redis to avoid database queries
 * on every request. Reduces DB load by 99%+
 * 
 * Performance: 5ms (cache hit) vs 50-200ms (database query)
 */


import { supabaseAdmin } from '../config/supabase.js';
import redis from '../config/redis.js';
import logger from './logger.js';

const TIER_CACHE_CONFIG = {
    TTL: 300, // 5 minutes in seconds
    KEY_PREFIX: 'tier:',
    DEFAULT_TIER: 'free'
};

/**
 * Get user tier from cache or database
 * 
 * Flow:
 * 1. Check Redis cache
 * 2. If miss, query database
 * 3. Cache result for 5 minutes
 * 4. Return tier data
 * 
 * @param {string} userId - User UUID
 * @returns {Promise<{tier: string, cachedAt: number, fromCache: boolean}>}
 */
export async function getUserTierCached(userId) {
    const cacheKey = TIER_CACHE_CONFIG.KEY_PREFIX + userId;
    const startTime = Date.now();

    try {
        // Try cache first
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
            const data = JSON.parse(cachedData);
            const cacheAge = data.cachedAt ? Math.round((Date.now() - data.cachedAt) / 1000) : 0;

            logger.info(`[TierCache] ✅ Cache HIT for ${userId.substring(0, 8)}... (age: ${cacheAge}s)`);

            return {
                ...data,
                fromCache: true,
                lookupTime: Date.now() - startTime
            };
        }

        // Cache miss - fetch from database
        logger.info(`[TierCache] ⚠️  Cache MISS for ${userId.substring(0, 8)}... - querying DB`);

        // ✅ NEW: Query profiles_with_tier view (computed tier + limits from subscription_plans)
        const { data: userData, error: dbError } = await supabaseAdmin
            .from('profiles_with_tier')
            .select('subscription_tier, subscription_tier_paid, subscription_status, is_subscription_expired, is_in_grace_period, days_until_expiration, api_requests_limit, plan_name')
            .eq('id', userId)
            .single();

        if (dbError) {
            logger.error(`[TierCache] ❌ Database error:`, dbError.message);
            // Return default tier on error
            return {
                tier: TIER_CACHE_CONFIG.DEFAULT_TIER,
                tier_paid: TIER_CACHE_CONFIG.DEFAULT_TIER,
                api_requests_limit: 1000,
                is_expired: false,
                is_in_grace: false,
                cachedAt: Date.now(),
                fromCache: false,
                error: dbError.message,
                lookupTime: Date.now() - startTime
            };
        }

        // subscription_tier is COMPUTED (respects expiration + grace period)
        const tier = userData?.subscription_tier || TIER_CACHE_CONFIG.DEFAULT_TIER;

        // Cache the result with richer data
        const cacheData = {
            tier,
            tier_paid: userData?.subscription_tier_paid || TIER_CACHE_CONFIG.DEFAULT_TIER,
            subscription_status: userData?.subscription_status || 'active',
            is_expired: userData?.is_subscription_expired || false,
            is_in_grace: userData?.is_in_grace_period || false,
            days_until_expiration: userData?.days_until_expiration || null,
            api_requests_limit: userData?.api_requests_limit || 1000,
            plan_name: userData?.plan_name || 'Free',
            cachedAt: Date.now()
        };

        await redis.setex(
            cacheKey,
            TIER_CACHE_CONFIG.TTL,
            JSON.stringify(cacheData)
        );

        logger.info(`[TierCache] 💾 Cached tier '${tier}' for ${userId.substring(0, 8)}... (TTL: ${TIER_CACHE_CONFIG.TTL}s)`);

        return {
            ...cacheData,
            fromCache: false,
            lookupTime: Date.now() - startTime
        };

    } catch (error) {
        logger.error(`tier cache error:`, { error });

        // Fail open - return default tier
        return {
            tier: TIER_CACHE_CONFIG.DEFAULT_TIER,
            tier_paid: TIER_CACHE_CONFIG.DEFAULT_TIER,
            api_requests_limit: 1000,
            is_expired: false,
            is_in_grace: false,
            cachedAt: Date.now(),
            fromCache: false,
            error: error.message,
            lookupTime: Date.now() - startTime
        };
    }
}

/**
 * Invalidate tier cache for a user
 * 
 * Call this when:
 * - User upgrades/downgrades subscription
 * - Tier changes manually
 * - Testing cache behavior
 * 
 * @param {string} userId - User UUID
 * @returns {Promise<boolean>} - True if cache was deleted
 */
export async function invalidateTierCache(userId) {
    const cacheKey = TIER_CACHE_CONFIG.KEY_PREFIX + userId;

    try {
        const result = await redis.del(cacheKey);

        if (result === 1) {
            logger.info(`[TierCache] 🗑️  Invalidated cache for ${userId.substring(0, 8)}...`);
            return true;
        } else {
            logger.info(`[TierCache] ⚠️  No cache found for ${userId.substring(0, 8)}...`);
            return false;
        }
    } catch (error) {
        logger.error(`tier cache error:`, { error });
        return false;
    }
}

/**
 * Invalidate ALL tier caches
 * 
 * Use with caution! Only for:
 * - Major tier changes across all users
 * - Testing/debugging
 * - Cache corruption issues
 * 
 * @returns {Promise<number>} - Number of caches deleted
 */
export async function invalidateAllTierCaches() {
    try {
        const pattern = TIER_CACHE_CONFIG.KEY_PREFIX + '*';
        const keys = await redis.keys(pattern);

        if (keys.length === 0) {
            logger.info(`[TierCache] ⚠️  No tier caches found`);
            return 0;
        }

        const result = await redis.del(...keys);
        logger.info(`[TierCache] 🗑️  Invalidated ${result} tier caches`);

        return result;
    } catch (error) {
        logger.error(`tier cache error:`, { error });
        return 0;
    }
}

/**
 * Get cache statistics
 * 
 * Useful for monitoring cache effectiveness
 * 
 * @returns {Promise<{totalCached: number, oldestCache: number, newestCache: number}>}
 */
export async function getTierCacheStats() {
    try {
        const pattern = TIER_CACHE_CONFIG.KEY_PREFIX + '*';
        const keys = await redis.keys(pattern);

        if (keys.length === 0) {
            return {
                totalCached: 0,
                oldestCache: null,
                newestCache: null
            };
        }

        const timestamps = [];

        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const parsed = JSON.parse(data);
                timestamps.push(parsed.cachedAt);
            }
        }

        const now = Date.now();
        const oldest = Math.min(...timestamps);
        const newest = Math.max(...timestamps);

        return {
            totalCached: keys.length,
            oldestCache: Math.floor((now - oldest) / 1000), // seconds ago
            newestCache: Math.floor((now - newest) / 1000), // seconds ago
            ttl: TIER_CACHE_CONFIG.TTL
        };
    } catch (error) {
        logger.error(`tier cache error:`, { error });
        return null;
    }
}

/**
 * Warm up cache for active users
 * 
 * Pre-populate cache for users likely to make requests soon
 * 
 * @param {string[]} userIds - Array of user UUIDs
 * @returns {Promise<number>} - Number of users cached
 */
export async function warmTierCache(userIds) {
    logger.info(`[TierCache] 🔥 Warming cache for ${userIds.length} users...`);

    let cached = 0;

    for (const userId of userIds) {
        try {
            await getUserTierCached(userId);
            cached++;
        } catch (error) {
            logger.error(`tier cache error for ${userId}:`, { error });
        }
    }

    logger.info(`[TierCache] ✅ Warmed cache for ${cached}/${userIds.length} users`);
    return cached;
}
