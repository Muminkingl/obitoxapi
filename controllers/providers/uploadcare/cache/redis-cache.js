/**
 * Layer 2: Redis Cache
 * Purpose: Persistent, shared cache across all server instances (5-50ms latency)
 * Scope: Shared across all servers
 * Fallback: Database if Redis fails
 */

import redis from '../../../../config/redis.js';
import { supabaseAdmin } from '../../../../config/supabase.js';

// Redis key prefixes
const REDIS_KEYS = {
    QUOTA: 'quota',               // User quotas
    BUCKET: 'bucket',             // Bucket access
    API_KEY: 'api_key'            // API key data
};

// TTL values (seconds)
const TTL = {
    QUOTA: 300,                   // 5 minutes
    BUCKET: 900,                  // 15 minutes
    API_KEY: 3600                 // 1 hour
};


/**
 * Get quota from Redis cache
 * @param {string} userId - User ID
 * @returns {Promise<Object>} { allowed, current, limit, needsRefresh }
 */
export async function getQuotaFromRedis(userId) {
    const key = `${REDIS_KEYS.QUOTA}:${userId}`;

    try {
        const cached = await redis.get(key);

        if (cached) {
            const quota = JSON.parse(cached);
            return {
                allowed: quota.current < quota.limit,
                current: quota.current,
                limit: quota.limit,
                remaining: quota.limit - quota.current,
                layer: 'redis',
                needsRefresh: false
            };
        }

        // Cache miss - fetch from database
        const dbQuota = await fetchQuotaFromDatabase(userId);

        // Cache the result
        await redis.setex(key, TTL.QUOTA, JSON.stringify(dbQuota));

        return {
            allowed: dbQuota.current < dbQuota.limit,
            current: dbQuota.current,
            limit: dbQuota.limit,
            remaining: dbQuota.limit - dbQuota.current,
            layer: 'redis-db',
            needsRefresh: false
        };

    } catch (error) {
        console.error('❌ Redis quota check failed:', error.message);

        // Fallback to database directly
        return await fetchQuotaFromDatabase(userId);
    }
}

/**
 * Check bucket access from Redis cache
 * @param {string} userId - User ID
 * @param {string} bucketName - Bucket name
 * @param {Object} developerSupabase - Developer's Supabase client
 * @returns {Promise<Object>} { allowed, layer }
 */
export async function checkBucketAccessRedis(userId, bucketName, developerSupabase = null) {
    const key = `${REDIS_KEYS.BUCKET}:${userId}:${bucketName}`;

    try {
        const cached = await redis.get(key);

        if (cached !== null) {
            return {
                allowed: cached === '1',
                layer: 'redis'
            };
        }

        // Cache miss - check Supabase API
        const hasAccess = await checkSupabaseBucketAccessDirect(bucketName, developerSupabase);

        // Cache the result
        await redis.setex(key, TTL.BUCKET, hasAccess ? '1' : '0');

        return {
            allowed: hasAccess,
            layer: 'redis-api'
        };

    } catch (error) {
        console.error('❌ Redis bucket check failed:', error.message);

        // Fallback to direct Supabase API call
        return {
            allowed: await checkSupabaseBucketAccessDirect(bucketName, developerSupabase),
            layer: 'fallback',
            fallback: true
        };
    }
}

/**
 * Invalidate cache for a user (on quota update, etc.)
 * @param {string} userId - User ID
 */
export async function invalidateUserCache(userId) {
    try {
        const patterns = [
            `${REDIS_KEYS.QUOTA}:${userId}`,
            `${REDIS_KEYS.BUCKET}:${userId}:*`,
            `${REDIS_KEYS.RATE_LIMIT}:${userId}:*`
        ];

        for (const pattern of patterns) {
            if (pattern.includes('*')) {
                const keys = await redis.keys(pattern);
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } else {
                await redis.del(pattern);
            }
        }

        console.log(`✅ Cache invalidated for user ${userId}`);
        return true;

    } catch (error) {
        console.error('❌ Cache invalidation failed:', error.message);
        return false;
    }
}

/**
 * Warmup Redis cache (preload common data)
 * @param {string} userId - User ID
 * @param {Object} userData - { quota, buckets }
 */
export async function warmupRedisCache(userId, userData) {
    try {
        if (userData.quota) {
            const key = `${REDIS_KEYS.QUOTA}:${userId}`;
            await redis.setex(key, TTL.QUOTA, JSON.stringify(userData.quota));
        }

        if (userData.buckets) {
            for (const bucket of userData.buckets) {
                const key = `${REDIS_KEYS.BUCKET}:${userId}:${bucket.name}`;
                await redis.setex(key, TTL.BUCKET, bucket.hasAccess ? '1' : '0');
            }
        }

        console.log(`✅ Redis cache warmed up for user ${userId}`);
        return true;

    } catch (error) {
        console.error('❌ Redis warmup failed:', error.message);
        return false;
    }
}

// ============================================================================
// DATABASE FALLBACK FUNCTIONS
// ============================================================================

/**
 * Fetch quota from database
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
async function fetchQuotaFromDatabase(userId) {
    try {
        const { data, error } = await supabaseAdmin
            .from('provider_usage')
            .select('upload_count')
            .eq('api_key_id', userId)
            .eq('provider', 'uploadcare')
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        const current = data?.upload_count || 0;
        const limit = 1000; // Default limit

        return {
            current,
            limit,
            layer: 'database',
            fallback: true
        };

    } catch (error) {
        console.error('❌ Database quota fetch failed:', error.message);

        // Fail open with default values
        return {
            current: 0,
            limit: 1000,
            layer: 'fail-open',
            fallback: true,
            warning: 'Database unavailable'
        };
    }
}

/**
 * Check bucket access directly from Supabase API
 * @param {string} bucketName - Bucket name
 * @param {Object} developerSupabase - Developer's Supabase client
 * @returns {Promise<boolean>}
 */
async function checkSupabaseBucketAccessDirect(bucketName, developerSupabase) {
    try {
        if (!developerSupabase) {
            console.warn('⚠️ No Supabase client provided, assuming access');
            return true; // Fail open for developer's bucket
        }

        const { data, error } = await developerSupabase.storage.listBuckets();

        if (error) throw error;

        const bucket = data.find(b => b.name === bucketName);
        return bucket !== undefined;

    } catch (error) {
        console.error('❌ Supabase bucket check failed:', error.message);

        // Fail open (assume access)
        return true;
    }
}

/**
 * Get Redis cache statistics (for monitoring)
 */
export async function getRedisCacheStats() {
    try {
        const info = await redis.info('stats');
        const dbsize = await redis.dbsize();

        return {
            connected: true,
            dbsize,
            info: info.split('\r\n').reduce((acc, line) => {
                const [key, value] = line.split(':');
                if (key && value) acc[key] = value;
                return acc;
            }, {})
        };

    } catch (error) {
        return {
            connected: false,
            error: error.message
        };
    }
}
