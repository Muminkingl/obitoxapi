/**
 * Redis Metrics Counters (v4 - WITH FILE TYPE TRACKING)
 * 
 * Read-side helpers for the consolidated metrics format.
 * 
 * KEY FORMAT: m:{apiKeyId}:{YYYY-MM-DD}
 * 
 * HASH FIELDS:
 *   req            - total request count
 *   p:{provider}   - per-provider request count  
 *   ft:{mimeType}  - file type count (e.g., ft:image/jpeg)
 *   fc:{category}  - file category count (e.g., fc:image)
 *   ts             - last activity timestamp
 *   uid            - user ID (set once via HSETNX)
 * 
 * Workers use these helpers to:
 *   1. SCAN for pending metrics keys
 *   2. Read metrics data (HGETALL)
 *   3. Parse provider breakdown from p: fields
 *   4. Parse file types from ft: fields
 *   5. Clear keys after successful DB sync
 */

import { getRedis } from '../../config/redis.js';

/**
 * Scan Redis for all consolidated metrics keys
 * Pattern: m:*
 * @returns {Promise<string[]>} Array of Redis keys
 */
export const getPendingMetrics = async () => {
    const redis = getRedis();
    if (!redis) return [];

    try {
        const keys = [];
        let cursor = '0';

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', 'm:*',
                'COUNT', 100
            );
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');

        return keys;
    } catch (error) {
        console.error('[Redis Counters] ❌ Error scanning metrics:', error.message);
        return [];
    }
};

/**
 * Parse a consolidated metrics key into its components
 * Key format: m:{apiKeyId}:{YYYY-MM-DD}
 * 
 * @param {string} key - Redis key
 * @returns {{ apiKeyId: string, date: string } | null}
 */
export const parseMetricsKey = (key) => {
    // m:{uuid}:{date}
    const parts = key.split(':');
    if (parts.length < 3 || parts[0] !== 'm') return null;

    // UUID is parts[1], date is the rest (YYYY-MM-DD contains hyphens, not colons)
    const apiKeyId = parts[1];
    const date = parts.slice(2).join(':'); // handles any edge cases

    return { apiKeyId, date };
};

/**
 * Parse metrics hash data into structured format
 * Extracts provider breakdown from p: prefixed fields
 * Extracts file types from ft: prefixed fields
 * Extracts file categories from fc: prefixed fields
 * 
 * @param {Object} data - Raw HGETALL result
 * @returns {{ totalRequests: number, providers: Object, fileTypes: Object, fileCategories: Object, lastUsedAt: number, userId: string }}
 */
export const parseMetricsData = (data) => {
    if (!data || Object.keys(data).length === 0) return null;

    const result = {
        totalRequests: parseInt(data.req) || 0,
        providers: {},
        fileTypes: {},
        fileCategories: {},
        lastUsedAt: parseInt(data.ts) || 0,
        userId: data.uid || null
    };

    // Extract provider counts from p:{provider} fields
    // Extract file type counts from ft:{mimeType} fields
    // Extract file category counts from fc:{category} fields
    for (const [field, value] of Object.entries(data)) {
        if (field.startsWith('p:')) {
            const provider = field.substring(2); // strip "p:"
            result.providers[provider] = parseInt(value) || 0;
        } else if (field.startsWith('ft:')) {
            const mimeType = field.substring(3); // strip "ft:"
            result.fileTypes[mimeType] = parseInt(value) || 0;
        } else if (field.startsWith('fc:')) {
            const category = field.substring(3); // strip "fc:"
            result.fileCategories[category] = parseInt(value) || 0;
        }
    }

    return result;
};

/**
 * Get raw metrics for a specific key
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

/**
 * Get Redis client for direct access
 */
export { getRedis };

/**
 * LEGACY: Get pending daily API key metrics keys
 * Pattern: daily:{date}:apikey:*
 */
export const getPendingDailyApiKeyMetrics = async (date) => {
    const redis = getRedis();
    if (!redis) return [];

    try {
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
        console.error('[Redis Counters] ❌ Error scanning legacy API key metrics:', error.message);
        return [];
    }
};

/**
 * LEGACY: Get pending daily provider metrics keys
 * Pattern: daily:{date}:provider:*
 */
export const getPendingDailyProviderMetrics = async (date) => {
    const redis = getRedis();
    if (!redis) return [];

    try {
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
        console.error('[Redis Counters] ❌ Error scanning legacy provider metrics:', error.message);
        return [];
    }
};
