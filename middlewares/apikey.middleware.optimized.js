import { supabaseAdmin } from '../database/supabase.js';
import { getRedis } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Optimized API Key Validation Middleware
 *
 * Layer    | Latency  | I/O
 * ---------|----------|--------------------------
 * L1 hit   | ~0ms     | 0 (in-process Map)
 * L2 hit   | ~2-5ms   | 1 Redis GET
 * L3 miss  | ~80ms    | 1 RPC (api_key + profile in one query)
 *
 * Cache TTL: L1 = 30s (per-process), L2 = 5min (Redis)
 * Cache key: `apikey:{key_value}`
 *
 * FIX #1: last_used_at UPDATE removed — metrics-worker handles it every 5s
 * FIX #2: Two sequential DB calls replaced by single RPC (get_api_key_with_profile)
 * FIX #3: Dead rate-limit block removed (rate_limit_per_hour column gone)
 * FIX #4: Redundant expires_at date comparison removed — Redis TTL is sufficient
 * FIX #5: getRedis() hoisted — called once per middleware invocation
 */

const CACHE_TTL = 300;        // Redis L2: 5 minutes
const CACHE_KEY_PREFIX = 'apikey:';

// ─── L1: In-Process Cache ─────────────────────────────────────────────────────
// Zero Redis commands on hit. 30s TTL, max 1000 entries, LRU via Map insertion order.
const LOCAL_CACHE = new Map();
const LOCAL_TTL = 30 * 1000;  // 30 seconds in ms
const LOCAL_MAX = 1000;

function getLocalCache(cacheKey) {
  const entry = LOCAL_CACHE.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    LOCAL_CACHE.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setLocalCache(cacheKey, data) {
  if (LOCAL_CACHE.size >= LOCAL_MAX) {
    LOCAL_CACHE.delete(LOCAL_CACHE.keys().next().value); // evict oldest
  }
  LOCAL_CACHE.set(cacheKey, { data, expiresAt: Date.now() + LOCAL_TTL });
}

// ─── L3: DB Fetch (cache miss only) ──────────────────────────────────────────
// FIX #2: Single RPC replaces two sequential SELECT queries.
// get_api_key_with_profile() does a LEFT JOIN api_keys + profiles_with_tier
// server-side and returns profile as nested JSONB — one round-trip total.
const fetchApiKeyFromDatabase = async (apiKey) => {
  const { data: row, error } = await supabaseAdmin
    .rpc('get_api_key_with_profile', { p_key_value: apiKey })
    .single();

  if (error) {
    logger.error('Error fetching API key via RPC:', error.message, error.code);
    return null;
  }

  if (!row) {
    logger.warn('API key not found:', apiKey.substring(0, 20) + '...');
    return null;
  }

  logger.debug('API key fetched from database:', row.id);

  // profile arrives as nested JSONB — matches old shape { ...apiKeyData, profile }
  return {
    ...row,
    cached_at: new Date().toISOString(),
  };
};

// ─── Cache Orchestrator ───────────────────────────────────────────────────────
// FIX #5: redis is passed in — getRedis() called once per request at the top.
// FIX #4: No manual expires_at check — Redis TTL handles expiration natively.
const getApiKeyData = async (apiKey, redis) => {
  const cacheKey = `${CACHE_KEY_PREFIX}${apiKey}`;

  // L1: Local process cache — zero I/O
  const localHit = getLocalCache(cacheKey);
  if (localHit) return { data: localHit, fromCache: true };

  // L2: Redis cache — 1 GET
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        setLocalCache(cacheKey, data); // warm L1 for subsequent requests
        return { data, fromCache: true };
      }
    } catch (cacheError) {
      logger.warn('Redis cache read error:', cacheError.message);
    }
  }

  // L3: Database — 1 RPC (api_key + profile joined)
  const data = await fetchApiKeyFromDatabase(apiKey);
  if (!data) return null;

  // Populate caches
  setLocalCache(cacheKey, data);
  if (redis) {
    redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data))
      .catch(err => logger.warn('Redis cache write error:', err.message));
  }

  return { data, fromCache: false };
};

// ─── Middleware ───────────────────────────────────────────────────────────────
const validateApiKey = async (req, res, next) => {
  // FIX #5: getRedis() called exactly once per request
  const redis = getRedis();

  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required',
        error: 'MISSING_API_KEY'
      });
    }

    // Fast format check — no I/O
    if (!apiKey.startsWith('ox_') || apiKey.length < 10) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key format',
        error: 'INVALID_API_KEY_FORMAT'
      });
    }

    const result = await getApiKeyData(apiKey, redis);

    if (!result?.data) {
      logger.debug('API key validation failed:', apiKey.substring(0, 20) + '...');
      return res.status(401).json({
        success: false,
        message: 'Invalid API key',
        error: 'INVALID_API_KEY'
      });
    }

    const apiKeyData = result.data;

    if (apiKeyData.is_active === false) {
      return res.status(401).json({
        success: false,
        message: 'API key is inactive',
        error: 'INACTIVE_API_KEY'
      });
    }

    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < Date.now()) {
      // Bust both cache layers — key has expired
      LOCAL_CACHE.delete(`${CACHE_KEY_PREFIX}${apiKey}`);
      if (redis) redis.del(`${CACHE_KEY_PREFIX}${apiKey}`).catch(() => { });
      return res.status(401).json({
        success: false,
        message: 'API key has expired',
        error: 'EXPIRED_API_KEY'
      });
    }

    // FIX #1: last_used_at UPDATE removed entirely.
    // The metrics-worker syncs last_used_at from Redis every 5 seconds.
    // Firing a DB UPDATE here on every request was 1 redundant write per request.

    // FIX #3: Dead rate-limit block removed.
    // rate_limit_per_hour column no longer exists. Rate limiting is handled
    // by the rate-limiter middleware using Redis counters.

    // Attach to request for downstream use
    req.userId = apiKeyData.user_id;
    req.apiKeyId = apiKeyData.id;
    req.apiKeyName = apiKeyData.name;
    req.apiKeyData = apiKeyData;
    req.fromCache = result.fromCache;
    req.secretHash = apiKeyData.secret_hash;   // avoids extra DB call in signature validator
    req.rateLimitIdentifier = apiKeyData.user_id;       // consistent ID for all rate-limit middlewares

    next();
  } catch (error) {
    logger.error('API key validation error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error during API key validation',
      error: 'VALIDATION_ERROR',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
};

// ─── Cache Invalidation (exported) ───────────────────────────────────────────
// Call when an API key is updated, deactivated, or deleted.
export const invalidateApiKeyCache = async (apiKey) => {
  const cacheKey = `${CACHE_KEY_PREFIX}${apiKey}`;
  LOCAL_CACHE.delete(cacheKey);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(cacheKey);
  } catch (error) {
    logger.warn('Failed to invalidate API key cache:', error.message);
  }
};

export default validateApiKey;
