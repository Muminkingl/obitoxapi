/**
 * Redis Client — Dual-Mode
 *
 * Auto-detects the runtime environment:
 *   - Node.js / DigitalOcean (PM2 workers):  uses ioredis over TCP (REDIS_URL)
 *   - Cloudflare Workers:                    uses @upstash/redis over HTTP
 *
 * All code that calls getRedis() works unchanged in both environments.
 */

import logger from '../utils/logger.js';

// ─── Environment: Cloudflare Workers have no `process` ───────────────────────
const IS_CF_WORKER = typeof process === 'undefined';

const REDIS_URL = typeof process !== 'undefined' ? process.env?.REDIS_URL : undefined;
const UPSTASH_REST_URL = typeof process !== 'undefined'
  ? process.env?.UPSTASH_REDIS_REST_URL
  : globalThis.UPSTASH_REDIS_REST_URL;
const UPSTASH_REST_TOKEN = typeof process !== 'undefined'
  ? process.env?.UPSTASH_REDIS_REST_TOKEN
  : globalThis.UPSTASH_REDIS_REST_TOKEN;

// ─── Initialise the right client once at module load ─────────────────────────
let redis = null;

function initRedis() {
  // ── Cloudflare Workers path ──────────────────────────────────────────
  if (IS_CF_WORKER) {
    if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
      logger.warn('[Redis] UPSTASH_REDIS_REST_URL / TOKEN missing — Redis disabled for CF Worker.');
      return null;
    }
    try {
      // @upstash/redis is a pure-HTTP client — works in CF Workers
      const { Redis } = require('@upstash/redis'); // bundler resolves this
      const client = new Redis({ url: UPSTASH_REST_URL, token: UPSTASH_REST_TOKEN });
      logger.info('[Redis] @upstash/redis HTTP client ready (CF Workers)');
      return client;
    } catch (err) {
      logger.error('[Redis] Failed to init Upstash client:', { message: err.message });
      return null;
    }
  }

  // ── Node.js path (DigitalOcean, local dev) ───────────────────────────
  if (!REDIS_URL) {
    logger.warn('[Redis] REDIS_URL not set — Redis disabled.');
    return null;
  }

  try {
    // ioredis works perfectly in Node.js via TCP
    const { Redis } = ioredisModule();
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
      connectTimeout: 10000,
      keepAlive: 10000,
      enableOfflineQueue: true,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
    });

    client.on('connect', () => logger.debug('Redis: Connecting...'));
    client.on('ready', () => logger.info('Redis: Connected and ready'));
    client.on('close', () => logger.debug('Redis: Connection closed (will auto-reconnect)'));
    client.on('end', () => logger.warn('Redis: Connection ended'));
    client.on('reconnecting', (ms) => logger.debug(`Redis: Reconnecting in ${ms}ms...`));
    client.on('error', (err) => {
      const msg = err?.message || String(err);
      if (msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED')) {
        logger.debug('Redis: Connection reset (normal for idle connections)');
      } else {
        logger.error('Redis connection error:', { message: msg });
      }
    });

    // Startup ping (non-blocking, purely informational)
    client.ping()
      .then(() => {
        const t = Date.now();
        return client.ping().then(() => {
          logger.info(`Redis: Connection test successful (latency: ${Date.now() - t}ms)`);
        });
      })
      .catch((err) => {
        if (!err?.message?.includes('ECONNRESET')) {
          logger.error('Redis: Startup ping failed:', { message: err.message });
        }
      });

    logger.info('[Redis] ioredis TCP client ready (Node.js)');
    return client;
  } catch (err) {
    logger.error('[Redis] Failed to init ioredis client:', { message: err.message });
    return null;
  }
}

// Resolve ioredis only in Node.js environments to avoid CF Workers bundling it
function ioredisModule() {
  // eslint-disable-next-line
  return require('ioredis');
}

// Initialise once
redis = initRedis();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the Redis client (ioredis or @upstash/redis) or null */
export const getRedis = () => redis;

/** Pings Redis and returns latency info */
export const testRedisConnection = async () => {
  if (!redis) return { success: false, error: 'Redis not configured' };
  try {
    const start = Date.now();
    const result = await redis.ping();
    const latency = Date.now() - start;
    return result === 'PONG'
      ? { success: true, latency }
      : { success: false, error: 'Unexpected ping response' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export default redis;
