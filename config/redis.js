import { Redis } from 'ioredis';
import { REDIS_URL } from './env.js';
import logger from '../utils/logger.js';

/**
 * Redis connection for caching and rate limiting
 * Uses Upstash Redis (serverless) for optimal performance
 * 
 * Connection priority:
 * 1. REDIS_URL (if provided) - for direct Redis connection
 * 
 * Configuration optimized for:
 * - Low latency (<5ms)
 * - High availability
 * - Auto-reconnection
 * - Graceful handling of idle connection resets (ECONNRESET)
 */
let redis;

// Determine which URL to use
const redisUrl = REDIS_URL;

if (!redisUrl) {
  logger.warn('Redis URL not found. Caching will be disabled. Set REDIS_URL in .env.local');
} else {
  // Create Redis client with optimized settings for Upstash
  redis = new Redis(redisUrl, {
    // Connection settings
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,

    // Retry settings - more aggressive for serverless
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis: Max retry attempts reached');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      logger.debug(`Redis retry attempt ${times}, waiting ${delay}ms...`);
      return delay;
    },

    // Connection timeout
    connectTimeout: 10000,

    // Keep connection alive - ping every 10s to prevent idle disconnect
    keepAlive: 10000,

    // Enable offline queue (queue commands when disconnected)
    enableOfflineQueue: true,

    // Auto-reconnect on connection drop
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,

    // Log connection events in development
    ...(process.env.NODE_ENV === 'development' && {
      showFriendlyErrorStack: true,
    }),
  });

  // Connection event handlers
  redis.on('connect', () => {
    logger.debug('Redis: Connecting...');
  });

  redis.on('ready', () => {
    logger.info('Redis: Connected and ready');
  });

  redis.on('error', (err) => {
    // ECONNRESET is normal for idle Upstash connections - don't log as error
    // ioredis may emit error as string "read ECONNRESET" or as Error object
    const msg = err?.message || String(err);
    if (
      msg.includes('ECONNRESET') ||
      err?.code === 'ECONNRESET' ||
      msg.includes('ECONNREFUSED') ||
      msg === 'read ECONNRESET'
    ) {
      logger.debug('Redis: Connection reset (normal for idle connections)');
    } else {
      logger.error('Redis connection error:', { message: msg });
    }
  });

  redis.on('close', () => {
    logger.debug('Redis: Connection closed (will auto-reconnect)');
  });

  redis.on('reconnecting', (delay) => {
    logger.debug(`Redis: Reconnecting in ${delay}ms...`);
  });

  redis.on('end', () => {
    logger.warn('Redis: Connection ended (no more retries)');
  });

  // Test connection on startup (non-blocking)
  redis.ping()
    .then(() => {
      const startTime = Date.now();
      return redis.ping().then(() => {
        const latency = Date.now() - startTime;
        logger.info(`Redis: Connection test successful (latency: ${latency}ms)`);
      });
    })
    .catch((err) => {
      // Don't log ECONNRESET as error on startup
      if (!err.message?.includes('ECONNRESET')) {
        logger.error('Redis: Connection test failed:', { message: err.message });
      }
    });
}

/**
 * Get Redis client instance
 * @returns {Redis|null} Redis client or null if not configured
 */
export const getRedis = () => {
  if (!redis) {
    logger.debug('Redis not initialized. Returning null.');
    return null;
  }
  return redis;
};

/**
 * Test Redis connection
 * @returns {Promise<{success: boolean, latency?: number, error?: string}>}
 */
export const testRedisConnection = async () => {
  if (!redis) {
    return { success: false, error: 'Redis not configured' };
  }

  try {
    const startTime = Date.now();
    const result = await redis.ping();
    const latency = Date.now() - startTime;

    if (result === 'PONG') {
      return { success: true, latency };
    } else {
      return { success: false, error: 'Unexpected response from Redis' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Export default Redis client
export default redis;

