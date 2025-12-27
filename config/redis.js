import { Redis } from 'ioredis';
import { UPSTASH_REDIS_URL, REDIS_URL } from './env.js';

/**
 * Redis connection for caching and rate limiting
 * Uses Upstash Redis (serverless) for optimal performance
 * 
 * Connection priority:
 * 1. REDIS_URL (if provided) - for direct Redis connection
 * 2. UPSTASH_REDIS_URL (if provided) - for Upstash REST API
 * 
 * Configuration optimized for:
 * - Low latency (<5ms)
 * - High availability
 * - Auto-reconnection
 */
let redis;

// Determine which URL to use
const redisUrl = REDIS_URL || UPSTASH_REDIS_URL;

if (!redisUrl) {
  console.warn('⚠️  Redis URL not found. Caching will be disabled.');
  console.warn('   Please set REDIS_URL or UPSTASH_REDIS_URL in .env.local');
} else {
  // Create Redis client with optimized settings
  redis = new Redis(redisUrl, {
    // Connection settings
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: true,
    
    // Retry settings
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`Redis retry attempt ${times}, waiting ${delay}ms...`);
      return delay;
    },
    
    // Connection timeout
    connectTimeout: 10000,
    
    // Keep connection alive
    keepAlive: 30000,
    
    // Enable offline queue (queue commands when disconnected)
    enableOfflineQueue: true,
    
    // Log connection events in development
    ...(process.env.NODE_ENV === 'development' && {
      showFriendlyErrorStack: true,
    }),
  });

  // Connection event handlers
  redis.on('connect', () => {
    console.log('✅ Redis: Connecting...');
  });

  redis.on('ready', () => {
    console.log('✅ Redis: Connected and ready');
  });

  redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
    // Don't crash the app, just log the error
  });

  redis.on('close', () => {
    console.warn('⚠️  Redis: Connection closed');
  });

  redis.on('reconnecting', (delay) => {
    console.log(`🔄 Redis: Reconnecting in ${delay}ms...`);
  });

  // Test connection on startup (non-blocking)
  redis.ping()
    .then(() => {
      const startTime = Date.now();
      return redis.ping().then(() => {
        const latency = Date.now() - startTime;
        console.log(`✅ Redis: Connection test successful (latency: ${latency}ms)`);
      });
    })
    .catch((err) => {
      console.error('❌ Redis: Connection test failed:', err.message);
    });
}

/**
 * Get Redis client instance
 * @returns {Redis|null} Redis client or null if not configured
 */
export const getRedis = () => {
  if (!redis) {
    console.warn('⚠️  Redis not initialized. Returning null.');
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

