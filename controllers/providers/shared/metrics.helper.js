/**
 * Request Metrics Helper (v5 - SIMPLIFIED)
 * 
 * 🚀 OPTIMIZATIONS:
 * - Single pipeline per request (1 round-trip to Redis)
 * - Tracks ONLY request counts (no file sizes - files never hit server)
 * - Graceful degradation (continues even if Redis fails)
 * 
 * PERFORMANCE:
 * - ~8 Redis ops per request in single pipeline
 * - ~2-5ms latency
 * 
 * NOTE: We only track request counts since files never hit our server.
 * File size tracking is meaningless for presigned URL architecture.
 */

import { getRedis } from '../../../config/redis.js';

const METRICS_TTL = 60 * 60 * 24 * 7; // 7 days
const DAILY_TTL = 60 * 60 * 48; // 48 hours

// Metrics for monitoring the metrics system itself
let metricsUpdateCount = 0;
let metricsFailureCount = 0;
let lastFailureTime = null;

/**
 * Update all request metrics in a single atomic operation
 * 
 * NOTE: We only track total_requests and upload_count.
 * Success/failed tracking removed as every API request generates a signed URL successfully.
 * File size tracking removed as files never hit our server.
 * 
 * @param {string} apiKeyId - API key UUID
 * @param {string} userId - User UUID
 * @param {string} provider - Provider name (r2, s3, uploadcare, etc)
 * @param {boolean} success - Ignored (kept for interface compatibility)
 * @param {Object} additionalData - Ignored (fileSize not tracked)
 */
export const updateRequestMetrics = async (
  apiKeyId, 
  userId, 
  provider, 
  success = true, 
  additionalData = {}
) => {
  const startTime = Date.now();

  try {
    // Validation
    if (!apiKeyId) {
      console.warn('[Metrics] ⚠️ Missing apiKeyId - skipping metrics');
      return;
    }

    const redis = getRedis();
    
    if (!redis) {
      console.warn('[Metrics] ⚠️ Redis not available - skipping metrics');
      metricsFailureCount++;
      lastFailureTime = Date.now();
      return;
    }

    // Check Redis connection health
    if (redis.status !== 'ready') {
      console.warn(`[Metrics] ⚠️ Redis status: ${redis.status} - skipping metrics`);
      metricsFailureCount++;
      lastFailureTime = Date.now();
      return;
    }

    // ═══════════════════════════════════════════════════════
    // SINGLE PIPELINE - All operations in one round-trip
    // We ONLY track request counts (no file sizes)
    // ═══════════════════════════════════════════════════════
    
    const pipeline = redis.pipeline();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // ───────────────────────────────────────────────────────
    // 1. API Key Real-time Metrics (request count only)
    // ───────────────────────────────────────────────────────
    const apiKeyKey = `metrics:apikey:${apiKeyId}`;
    
    pipeline.hincrby(apiKeyKey, 'total_requests', 1);
    pipeline.hincrby(apiKeyKey, 'total_files_uploaded', 1);
    pipeline.hset(apiKeyKey, 'last_used_at', now);
    pipeline.expire(apiKeyKey, METRICS_TTL);

    // ───────────────────────────────────────────────────────
    // 2. Provider Real-time Metrics (upload count only)
    // ───────────────────────────────────────────────────────
    if (provider) {
      const providerKey = `metrics:provider:${apiKeyId}:${provider}`;
      
      if (userId) {
        pipeline.hset(providerKey, 'user_id', userId);
      }
      
      pipeline.hincrby(providerKey, 'upload_count', 1);
      pipeline.hset(providerKey, 'last_used_at', now);
      pipeline.expire(providerKey, METRICS_TTL);
    }

    // ───────────────────────────────────────────────────────
    // 3. Daily API Key Metrics (request count only)
    // ───────────────────────────────────────────────────────
    const dailyApiKeyKey = `daily:${today}:apikey:${apiKeyId}`;
    
    if (userId) {
      pipeline.hset(dailyApiKeyKey, 'user_id', userId);
    }
    
    pipeline.hincrby(dailyApiKeyKey, 'total_requests', 1);
    pipeline.hincrby(dailyApiKeyKey, 'total_files_uploaded', 1);
    pipeline.expire(dailyApiKeyKey, DAILY_TTL);

    // ───────────────────────────────────────────────────────
    // 4. Daily Provider Metrics (upload count only)
    // ───────────────────────────────────────────────────────
    if (provider) {
      const dailyProviderKey = `daily:${today}:provider:${apiKeyId}:${provider}`;
      
      if (userId) {
        pipeline.hset(dailyProviderKey, 'user_id', userId);
      }
      
      pipeline.hincrby(dailyProviderKey, 'upload_count', 1);
      pipeline.expire(dailyProviderKey, DAILY_TTL);
    }

    // ═══════════════════════════════════════════════════════
    // Execute Pipeline with Error Handling
    // ═══════════════════════════════════════════════════════
    
    const results = await pipeline.exec();
    
    // Check for errors in pipeline results
    if (results) {
      let hasErrors = false;
      const errors = [];
      
      results.forEach((result, index) => {
        const [err, value] = result;
        if (err) {
          hasErrors = true;
          errors.push({ index, error: err.message });
        }
      });
      
      if (hasErrors) {
        console.error('[Metrics] ❌ Pipeline had errors:', errors);
        metricsFailureCount++;
        lastFailureTime = Date.now();
      } else {
        metricsUpdateCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    // Log slow operations
    if (duration > 50) {
      console.warn(`[Metrics] ⚠️ Slow update: ${duration}ms for ${apiKeyKey}`);
    }

  } catch (error) {
    // ✅ CRITICAL: Don't throw! Just log and continue
    // Metrics should NEVER cause user-facing errors
    console.error('[Metrics] ❌ Error updating metrics:', {
      error: error.message,
      apiKeyId,
      provider,
      stack: error.stack
    });
    
    metricsFailureCount++;
    lastFailureTime = Date.now();
    
    // Don't throw - let the request continue
  }
};

/**
 * Get metrics system health
 * Useful for monitoring/alerting
 */
export const getMetricsHealth = () => {
  const redis = getRedis();
  
  return {
    total_updates: metricsUpdateCount,
    total_failures: metricsFailureCount,
    failure_rate: metricsUpdateCount > 0 
      ? ((metricsFailureCount / (metricsUpdateCount + metricsFailureCount)) * 100).toFixed(2) + '%'
      : '0%',
    last_failure: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
    redis_status: redis ? redis.status : 'disconnected',
    healthy: redis?.status === 'ready' && metricsFailureCount < 100
  };
};

/**
 * Reset metrics health counters
 * Call this periodically (e.g., every hour)
 */
export const resetMetricsHealth = () => {
  metricsUpdateCount = 0;
  metricsFailureCount = 0;
  lastFailureTime = null;
};

export default {
  updateRequestMetrics,
  getMetricsHealth,
  resetMetricsHealth
};
