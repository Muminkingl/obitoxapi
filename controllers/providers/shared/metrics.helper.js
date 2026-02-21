/**
 * Request Metrics Helper (v7 - WITH FILE TYPE TRACKING)
 * 
 * 🚀 OPTIMIZATIONS:
 * - Single consolidated key per apiKey per day: m:{apiKeyId}:{date}
 * - Only 5-7 Redis commands per request (down from ~15)
 * - Provider breakdown via p:{provider} hash fields
 * - File type tracking via ft:{mimeType} hash fields
 * - Static metadata (user_id) set via HSETNX (1 extra cmd on first request only)
 * 
 * KEY FORMAT:
 *   m:{apiKeyId}:{YYYY-MM-DD}
 * 
 * HASH FIELDS:
 *   req            - total request count (HINCRBY)
 *   p:{provider}   - per-provider request count (HINCRBY)
 *   ft:{mimeType}  - file type count, e.g., ft:image/jpeg (HINCRBY)
 *   fc:{category}  - file category count, e.g., fc:image (HINCRBY)
 *   ts             - last activity timestamp (HSET)
 *   uid            - user ID (HSETNX, set once)
 * 
 * PERFORMANCE:
 *   Before: ~15 Redis ops across 4 keys per request
 *   After:  5-7 Redis ops on 1 key per request
 */

import { getRedis } from '../../../config/redis.js';
import logger from '../../../utils/logger.js';

const METRICS_TTL = 60 * 60 * 24 * 7; // 7 days

// Metrics for monitoring the metrics system itself
let metricsUpdateCount = 0;
let metricsFailureCount = 0;
let lastFailureTime = null;

/**
 * Update all request metrics in a single atomic operation
 * 
 * Consolidated into 1 key: m:{apiKeyId}:{date}
 * 
 * @param {string} apiKeyId - API key UUID
 * @param {string} userId - User UUID
 * @param {string} provider - Provider name (r2, s3, uploadcare, supabase)
 * @param {boolean} success - Ignored (kept for interface compatibility)
 * @param {Object} additionalData - Additional metadata
 * @param {string} additionalData.contentType - MIME type (e.g., 'image/jpeg')
 * @param {string} additionalData.filename - Original filename (optional)
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
    if (!apiKeyId) {
      logger.warn('Missing apiKeyId - skipping metrics');
      return;
    }

    const redis = getRedis();

    if (!redis) {
      logger.warn('Redis not available - skipping metrics');
      metricsFailureCount++;
      lastFailureTime = Date.now();
      return;
    }

    if (redis.status !== 'ready') {
      logger.warn('Redis not ready - skipping metrics', { status: redis.status });
      metricsFailureCount++;
      lastFailureTime = Date.now();
      return;
    }

    // ═══════════════════════════════════════════════════════
    // SINGLE KEY, 5-7 OPERATIONS (with file type tracking)
    // ═══════════════════════════════════════════════════════

    const pipeline = redis.pipeline();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const key = `m:${apiKeyId}:${today}`;

    // 1. Total request count
    pipeline.hincrby(key, 'req', 1);

    // 2. Provider breakdown (e.g., p:uploadcare, p:s3, p:r2, p:supabase)
    if (provider) {
      pipeline.hincrby(key, `p:${provider}`, 1);
    }

    // 3. File type tracking (e.g., ft:image/jpeg, ft:application/pdf)
    if (additionalData.contentType) {
      // Track specific MIME type
      pipeline.hincrby(key, `ft:${additionalData.contentType}`, 1);
      
      // Track category (image, video, document, etc.)
      const category = additionalData.contentType.split('/')[0] || 'other';
      pipeline.hincrby(key, `fc:${category}`, 1);
    }

    // 4. Last activity timestamp
    pipeline.hset(key, 'ts', now);

    // 5. TTL (7 days)
    pipeline.expire(key, METRICS_TTL);

    // 6. Static metadata — only set once per key (HSETNX = no-op if exists)
    if (userId) {
      pipeline.hsetnx(key, 'uid', userId);
    }

    // ═══════════════════════════════════════════════════════
    // Execute Pipeline
    // ═══════════════════════════════════════════════════════

    const results = await pipeline.exec();

    if (results) {
      let hasErrors = false;
      const errors = [];

      results.forEach((result, index) => {
        const [err] = result;
        if (err) {
          hasErrors = true;
          errors.push({ index, error: err.message });
        }
      });

      if (hasErrors) {
        logger.error('Redis pipeline had errors', { errors });
        metricsFailureCount++;
        lastFailureTime = Date.now();
      } else {
        metricsUpdateCount++;
      }
    }

    const duration = Date.now() - startTime;

    if (duration > 50) {
      logger.debug('Slow metrics update', { duration, key });
    }

  } catch (error) {
    logger.error('Error updating metrics', {
      error: error.message,
      apiKeyId,
      provider,
      stack: error.stack
    });

    metricsFailureCount++;
    lastFailureTime = Date.now();
  }
};

/**
 * Get metrics system health
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
