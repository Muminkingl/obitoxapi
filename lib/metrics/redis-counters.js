/**
 * Redis Metrics Counters
 * 
 * Write-behind cache pattern for API metrics
 * - Increment counters in Redis (FAST - O(1))
 * - Background worker syncs to DB every 5 seconds
 * 
 * Reduces DB load from 7 queries/request to 2 queries/request
 */

import { getRedis } from '../../config/redis.js';

const METRICS_TTL = 60 * 60 * 24 * 7; // 7 days for inactive keys

/**
 * Increment API key metrics in Redis
 * @param {string} apiKeyId 
 * @param {Object} metrics - { total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded }
 */
export const incrementApiKeyMetrics = async (apiKeyId, metrics) => {
    const redis = getRedis();
    if (!redis || !apiKeyId) return;

    try {
        const key = `metrics:apikey:${apiKeyId}`;
        const pipeline = redis.pipeline();

        // Increment counters
        if (metrics.total_requests) {
            pipeline.hincrby(key, 'total_requests', metrics.total_requests);
        }
        if (metrics.successful_requests) {
            pipeline.hincrby(key, 'successful_requests', metrics.successful_requests);
        }
        if (metrics.failed_requests) {
            pipeline.hincrby(key, 'failed_requests', metrics.failed_requests);
        }
        if (metrics.total_file_size) {
            pipeline.hincrby(key, 'total_file_size', metrics.total_file_size);
        }
        if (metrics.total_files_uploaded) {
            pipeline.hincrby(key, 'total_files_uploaded', metrics.total_files_uploaded);
        }

        // Track last update time
        pipeline.hset(key, 'last_used_at', Date.now().toString());

        // Expire after 7 days of inactivity
        pipeline.expire(key, METRICS_TTL);

        await pipeline.exec();

    } catch (error) {
        console.error('[Redis Counters] ❌ Error incrementing API key metrics:', error.message);
    }
};

/**
 * Increment provider usage metrics in Redis
 * @param {string} apiKeyId 
 * @param {string} userId 
 * @param {string} provider 
 * @param {Object} metrics - { upload_count, total_file_size }
 */
export const incrementProviderMetrics = async (apiKeyId, userId, provider, metrics) => {
    const redis = getRedis();
    if (!redis || !apiKeyId || !provider) return;

    try {
        const key = `metrics:provider:${apiKeyId}:${provider}`;
        const pipeline = redis.pipeline();

        // Store user_id for later sync
        pipeline.hset(key, 'user_id', userId || '');
        pipeline.hset(key, 'api_key_id', apiKeyId);
        pipeline.hset(key, 'provider', provider);

        // Increment counters
        if (metrics.upload_count) {
            pipeline.hincrby(key, 'upload_count', metrics.upload_count);
        }
        if (metrics.total_file_size) {
            pipeline.hincrby(key, 'total_file_size', metrics.total_file_size);
        }

        // Track last update time
        pipeline.hset(key, 'last_used_at', Date.now().toString());

        // Expire after 7 days of inactivity
        pipeline.expire(key, METRICS_TTL);

        await pipeline.exec();

    } catch (error) {
        console.error('[Redis Counters] ❌ Error incrementing provider metrics:', error.message);
    }
};

/**
 * Scan Redis for pending API key metrics
 * @returns {Promise<string[]>} Array of Redis keys
 */
export const getPendingApiKeyMetrics = async () => {
    const redis = getRedis();
    if (!redis) return [];

    try {
        const keys = [];
        let cursor = '0';

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', 'metrics:apikey:*',
                'COUNT', 100
            );
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');

        return keys;
    } catch (error) {
        console.error('[Redis Counters] ❌ Error scanning API key metrics:', error.message);
        return [];
    }
};

/**
 * Scan Redis for pending provider metrics
 * @returns {Promise<string[]>} Array of Redis keys
 */
export const getPendingProviderMetrics = async () => {
    const redis = getRedis();
    if (!redis) return [];

    try {
        const keys = [];
        let cursor = '0';

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', 'metrics:provider:*',
                'COUNT', 100
            );
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');

        return keys;
    } catch (error) {
        console.error('[Redis Counters] ❌ Error scanning provider metrics:', error.message);
        return [];
    }
};

/**
 * Get metrics for a specific key
 * @param {string} key 
 * @returns {Promise<Object|null>}
 */
export const getMetrics = async (key) => {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const data = await redis.hgetall(key);
        if (!data || Object.keys(data).length === 0) return null;

        // Convert string numbers back to integers
        return Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, isNaN(v) ? v : parseInt(v)])
        );
    } catch (error) {
        console.error('[Redis Counters] ❌ Error getting metrics:', error.message);
        return null;
    }
};

/**
 * Clear metrics after successful sync
 * @param {string} key 
 */
export const clearMetrics = async (key) => {
    const redis = getRedis();
    if (!redis) return;

    try {
        await redis.del(key);
    } catch (error) {
        console.error('[Redis Counters] ❌ Error clearing metrics:', error.message);
    }
};

// ============================================================================
// DAILY ANALYTICS FUNCTIONS
// For historical date-based tracking (Redis → DB once per day)
// ============================================================================

const DAILY_TTL = 60 * 60 * 24 * 2; // 2 days (rollup happens at midnight)

/**
 * Get today's date in UTC (YYYY-MM-DD format)
 */
const getTodayUTC = () => {
    return new Date().toISOString().split('T')[0];
};

/**
 * Increment daily API key metrics in Redis
 * Key format: daily:{date}:apikey:{apiKeyId}
 * @param {string} apiKeyId 
 * @param {string} userId 
 * @param {Object} metrics - { total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded }
 */
export const incrementDailyApiKeyMetrics = async (apiKeyId, userId, metrics) => {
    const redis = getRedis();
    if (!redis || !apiKeyId) return;

    try {
        const today = getTodayUTC();
        const key = `daily:${today}:apikey:${apiKeyId}`;
        const pipeline = redis.pipeline();

        // Store metadata for rollup
        pipeline.hset(key, 'user_id', userId || '');
        pipeline.hset(key, 'api_key_id', apiKeyId);
        pipeline.hset(key, 'date', today);

        // Increment counters
        if (metrics.total_requests) {
            pipeline.hincrby(key, 'total_requests', metrics.total_requests);
        }
        if (metrics.successful_requests) {
            pipeline.hincrby(key, 'successful_requests', metrics.successful_requests);
        }
        if (metrics.failed_requests) {
            pipeline.hincrby(key, 'failed_requests', metrics.failed_requests);
        }
        if (metrics.total_file_size) {
            pipeline.hincrby(key, 'total_file_size', metrics.total_file_size);
        }
        if (metrics.total_files_uploaded) {
            pipeline.hincrby(key, 'total_files_uploaded', metrics.total_files_uploaded);
        }

        // Expire after 2 days (daily worker will sync before then)
        pipeline.expire(key, DAILY_TTL);

        await pipeline.exec();

    } catch (error) {
        console.error('[Redis Counters] ❌ Error incrementing daily API key metrics:', error.message);
    }
};

/**
 * Increment daily provider metrics in Redis
 * Key format: daily:{date}:provider:{apiKeyId}:{provider}
 * @param {string} apiKeyId 
 * @param {string} userId 
 * @param {string} provider 
 * @param {Object} metrics - { upload_count, total_file_size }
 */
export const incrementDailyProviderMetrics = async (apiKeyId, userId, provider, metrics) => {
    const redis = getRedis();
    if (!redis || !apiKeyId || !provider) return;

    try {
        const today = getTodayUTC();
        const key = `daily:${today}:provider:${apiKeyId}:${provider}`;
        const pipeline = redis.pipeline();

        // Store metadata for rollup
        pipeline.hset(key, 'user_id', userId || '');
        pipeline.hset(key, 'api_key_id', apiKeyId);
        pipeline.hset(key, 'provider', provider);
        pipeline.hset(key, 'date', today);

        // Increment counters
        if (metrics.upload_count) {
            pipeline.hincrby(key, 'upload_count', metrics.upload_count);
        }
        if (metrics.total_file_size) {
            pipeline.hincrby(key, 'total_file_size', metrics.total_file_size);
        }

        // Expire after 2 days
        pipeline.expire(key, DAILY_TTL);

        await pipeline.exec();

    } catch (error) {
        console.error('[Redis Counters] ❌ Error incrementing daily provider metrics:', error.message);
    }
};

/**
 * Scan Redis for pending daily API key metrics for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to yesterday)
 * @returns {Promise<string[]>} Array of Redis keys
 */
export const getPendingDailyApiKeyMetrics = async (date = null) => {
    const redis = getRedis();
    if (!redis) return [];

    try {
        // Default to yesterday
        if (!date) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            date = yesterday.toISOString().split('T')[0];
        }

        const keys = [];
        let cursor = '0';
        const pattern = `daily:${date}:apikey:*`;

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', pattern,
                'COUNT', 100
            );
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');

        return keys;
    } catch (error) {
        console.error('[Redis Counters] ❌ Error scanning daily API key metrics:', error.message);
        return [];
    }
};

/**
 * Scan Redis for pending daily provider metrics for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to yesterday)
 * @returns {Promise<string[]>} Array of Redis keys
 */
export const getPendingDailyProviderMetrics = async (date = null) => {
    const redis = getRedis();
    if (!redis) return [];

    try {
        // Default to yesterday
        if (!date) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            date = yesterday.toISOString().split('T')[0];
        }

        const keys = [];
        let cursor = '0';
        const pattern = `daily:${date}:provider:*`;

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', pattern,
                'COUNT', 100
            );
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');

        return keys;
    } catch (error) {
        console.error('[Redis Counters] ❌ Error scanning daily provider metrics:', error.message);
        return [];
    }
};

/**
 * Get Redis client for direct access
 */
export { getRedis };

