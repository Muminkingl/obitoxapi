/**
 * Layer 1: In-Memory Guard
 * Purpose: Instant blocking of abuse (0-5ms latency)
 * Scope: Per-server instance (not shared across instances)
 * No external dependencies - FASTEST possible check
 */

import NodeCache from 'node-cache';

// In-memory cache configuration
const memoryCache = new NodeCache({
    stdTTL: 60,           // Default 60 seconds TTL
    checkperiod: 10,      // Check for expired keys every 10 seconds
    maxKeys: 10000,       // Prevent memory bloat (10k users max)
    useClones: false      // Performance optimization
});

// Operation-specific limits (per minute)
const MEMORY_LIMITS = {
    'signed-url': 100,    // Generate signed URLs (high limit)
    'upload': 20,         // Server-side uploads (CPU intensive)
    'delete': 50,         // Delete operations
    'download': 100,      // Download URLs (low cost)
    'list': 30,           // List operations
    'info': 50            // Info/metadata requests
};

// Quota limits (cached in memory)
const QUOTA_LIMITS = {
    maxFiles: 1000,       // Max files per user
    maxStorage: 1024 * 1024 * 1024 // 1GB default
};

/**
 * Check rate limit in memory (FASTEST check - 0-5ms)
 * @param {string} userId - User ID or API key ID
 * @param {string} operation - Operation type (signed-url, upload, etc.)
 * @returns {Object} { allowed, current, limit, remaining, resetIn }
 */
export function checkMemoryRateLimit(userId, operation) {
    const key = `mem_rl:${userId}:${operation}`;
    const limit = MEMORY_LIMITS[operation] || 60; // Default 60/min

    // Get current count
    const current = memoryCache.get(key) || 0;

    // Check if limit exceeded
    if (current >= limit) {
        const ttl = memoryCache.getTtl(key);
        const resetIn = ttl ? ttl - Date.now() : 60000;

        return {
            allowed: false,
            current,
            limit,
            remaining: 0,
            resetIn,
            layer: 'memory'
        };
    }

    // Increment counter
    memoryCache.set(key, current + 1);

    return {
        allowed: true,
        current: current + 1,
        limit,
        remaining: limit - current - 1,
        resetIn: 60000,
        layer: 'memory'
    };
}

/**
 * Check quota in memory (cached from Redis/DB)
 * @param {string} userId - User ID
 * @returns {Object} { allowed, current, limit, needsRefresh }
 */
export function checkMemoryQuota(userId) {
    const key = `mem_quota:${userId}`;
    const quota = memoryCache.get(key);

    // Cache miss - needs refresh from Redis/DB
    if (!quota) {
        return {
            needsRefresh: true,
            layer: 'memory-miss'
        };
    }

    // Check if quota exceeded
    const allowed = quota.current < quota.limit;

    return {
        allowed,
        current: quota.current,
        limit: quota.limit,
        remaining: quota.limit - quota.current,
        needsRefresh: false,
        layer: 'memory'
    };
}

/**
 * Update cached quota in memory (called after Redis/DB fetch)
 * @param {string} userId - User ID
 * @param {Object} quotaData - { current, limit }
 */
export function setMemoryQuota(userId, quotaData) {
    const key = `mem_quota:${userId}`;

    // Cache for 5 minutes
    memoryCache.set(key, quotaData, 300);

    return true;
}

/**
 * Increment quota in memory (optimistic update)
 * @param {string} userId - User ID  
 * @param {number} amount - Amount to increment (file count or size)
 */
export function incrementMemoryQuota(userId, amount = 1) {
    const key = `mem_quota:${userId}`;
    const quota = memoryCache.get(key);

    if (quota) {
        quota.current += amount;
        memoryCache.set(key, quota, 300);
    }

    return quota;
}

/**
 * Check bucket access in memory (cached)
 * @param {string} userId - User ID
 * @param {string} bucketName - Bucket name
 * @returns {Object} { allowed, needsRefresh }
 */
export function checkMemoryBucketAccess(userId, bucketName) {
    const key = `mem_bucket:${userId}:${bucketName}`;
    const access = memoryCache.get(key);

    // Cache miss
    if (access === undefined) {
        return {
            needsRefresh: true,
            layer: 'memory-miss'
        };
    }

    return {
        allowed: access === true,
        needsRefresh: false,
        layer: 'memory'
    };
}

/**
 * Set bucket access in memory (after Redis/DB check)
 * @param {string} userId - User ID
 * @param {string} bucketName - Bucket name
 * @param {boolean} hasAccess - Access allowed?
 */
export function setMemoryBucketAccess(userId, bucketName, hasAccess) {
    const key = `mem_bucket:${userId}:${bucketName}`;

    // Cache for 15 minutes
    memoryCache.set(key, hasAccess, 900);

    return true;
}

/**
 * Clear all memory cache (for testing or manual invalidation)
 */
export function clearMemoryCache() {
    memoryCache.flushAll();
    console.log('✅ Memory cache cleared');
}

/**
 * Get cache statistics (for monitoring)
 */
export function getMemoryCacheStats() {
    return {
        keys: memoryCache.keys().length,
        hits: memoryCache.getStats().hits,
        misses: memoryCache.getStats().misses,
        ksize: memoryCache.getStats().ksize,
        vsize: memoryCache.getStats().vsize
    };
}

/**
 * Warmup cache with common data (optional optimization)
 * @param {string} userId - User ID
 * @param {Object} userData - { quota, buckets }
 */
export function warmupMemoryCache(userId, userData) {
    if (userData.quota) {
        setMemoryQuota(userId, userData.quota);
    }

    if (userData.buckets) {
        userData.buckets.forEach(bucket => {
            setMemoryBucketAccess(userId, bucket.name, bucket.hasAccess);
        });
    }

    console.log(`✅ Memory cache warmed up for user ${userId}`);
}

// Export cache instance for advanced usage
export { memoryCache };
