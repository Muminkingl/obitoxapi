/**
 * Request Metrics Helper — In-Memory Buffer Edition
 *
 * OPTIMIZATION: Zero Redis commands per request.
 *   Before: every upload → await pipeline(7 cmds) → 160ms round-trip
 *   After:  every upload → buf.req++ (sync, 0ms, 0 Redis)
 *           every 1 second → 1 pipeline flush (7 fields, 1 round-trip)
 *
 * At 5K req/min: from 35,000 Redis cmds/min → ~60 cmds/min from metrics.
 *
 * TRADE-OFF: if Node process crashes, at most 1 second of analytics data
 * is lost. Quota/billing data (sync-quotas) is unaffected — it stays real-time.
 *
 * KEY FORMAT: m:{apiKeyId}:{YYYY-MM-DD}
 * HASH FIELDS:
 *   req            — total request count
 *   p:{provider}   — per-provider count (e.g. p:supabase)
 *   ts             — last activity timestamp
 *   uid            — user ID (set once via HSETNX)
 */

import { getRedis } from '../../../config/redis.js';
import logger from '../../../utils/logger.js';

const METRICS_TTL = 60 * 60 * 24 * 7; // 7 days
const FLUSH_INTERVAL_MS = 1000;         // flush every 1 second

// ─── In-Memory Buffer ────────────────────────────────────────────────────────
// Map<redisKey, { req, providers, uid, ts }>
// JS is single-threaded → no locks needed, no race conditions.
let metricBuffer = new Map();

// Health counters (for /health endpoint)
let metricsUpdateCount = 0;
let metricsFailureCount = 0;
let lastFailureTime = null;

// ─── Flush Logic ─────────────────────────────────────────────────────────────

/**
 * Merge a source buffer Map into a destination Map.
 * Used when a flush fails — we put data back rather than lose it.
 */
function mergeInto(dest, src) {
  for (const [key, srcBuf] of src) {
    const existing = dest.get(key);
    if (!existing) {
      dest.set(key, srcBuf);
      continue;
    }
    existing.req += srcBuf.req;
    existing.ts = Math.max(existing.ts, srcBuf.ts);
    if (!existing.uid && srcBuf.uid) existing.uid = srcBuf.uid;
    for (const [k, v] of Object.entries(srcBuf.providers)) {
      existing.providers[k] = (existing.providers[k] || 0) + v;
    }
  }
}

/**
 * Flush accumulated buffer to Redis in a single pipeline.
 * Called automatically every 1 second by the interval below.
 */
async function flushMetricBuffer() {
  if (metricBuffer.size === 0) return;

  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return; // retry next tick

  // Swap buffer: hand off current buffer, new requests write to fresh Map
  const toFlush = metricBuffer;
  metricBuffer = new Map();

  try {
    const pipeline = redis.pipeline();

    for (const [key, buf] of toFlush) {
      if (buf.req === 0) continue;

      pipeline.hincrby(key, 'req', buf.req);

      for (const [provider, count] of Object.entries(buf.providers)) {
        pipeline.hincrby(key, `p:${provider}`, count);
      }

      if (buf.uid) pipeline.hsetnx(key, 'uid', buf.uid);
      pipeline.hset(key, 'ts', buf.ts);
      pipeline.expire(key, METRICS_TTL);
    }

    await pipeline.exec();
    metricsUpdateCount++;

  } catch (error) {
    // Flush failed — merge back so data isn't lost
    logger.warn('[Metrics] Flush failed, re-buffering:', { error: error.message });
    mergeInto(metricBuffer, toFlush);
    metricsFailureCount++;
    lastFailureTime = Date.now();
  }
}

// Auto-start 1-second flush interval when module is first imported.
// unref() prevents the interval from keeping the process alive on shutdown.
const _flushTimer = setInterval(flushMetricBuffer, FLUSH_INTERVAL_MS);
if (_flushTimer.unref) _flushTimer.unref();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a request in the in-memory buffer.
 * Synchronous, zero latency, zero Redis commands.
 *
 * Backward compatible: callers using `await updateRequestMetrics(...)` still work
 * (they just await undefined, which resolves immediately).
 *
 * @param {string} apiKeyId
 * @param {string} userId
 * @param {string} provider
 * @param {boolean} success   - kept for interface compatibility (ignored)
 * @param {Object} additionalData
 */
export const updateRequestMetrics = (apiKeyId, userId, provider, success = true, additionalData = {}) => {
  if (!apiKeyId) return Promise.resolve();

  const today = new Date().toISOString().split('T')[0];
  const key = `m:${apiKeyId}:${today}`;

  let buf = metricBuffer.get(key);
  if (!buf) {
    buf = { req: 0, providers: {}, uid: null, ts: 0 };
    metricBuffer.set(key, buf);
  }

  buf.req++;
  buf.ts = Date.now();

  if (provider) {
    buf.providers[provider] = (buf.providers[provider] || 0) + 1;
  }

  // uid only needs to be set once per key (HSETNX in flush)
  if (userId && !buf.uid) {
    buf.uid = userId;
  }

  // Return a resolved Promise so callers using .catch() or await don't crash.
  // The actual work is synchronous above — no Redis call happens here.
  return Promise.resolve();
};

/**
 * Get metrics system health (for /health endpoint).
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
    buffer_size: metricBuffer.size,
    healthy: (redis?.status === 'ready') && metricsFailureCount < 100
  };
};

/**
 * Reset health counters.
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
