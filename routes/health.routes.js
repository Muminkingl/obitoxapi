import { Router } from 'express';
import { getRedis, testRedisConnection } from '../config/redis.js';

const healthRouter = Router();

/**
 * Health check endpoint
 * GET /health
 */
healthRouter.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Redis health check endpoint
 * GET /health/redis
 * Tests Redis connection and returns status
 */
healthRouter.get('/redis', async (req, res) => {
  try {
    const redis = getRedis();
    
    if (!redis) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Redis not configured',
        redis: {
          configured: false,
          connected: false,
        },
      });
    }

    // Test connection
    const testResult = await testRedisConnection();
    
    if (testResult.success) {
      // Test SET operation
      const testKey = `health:test:${Date.now()}`;
      const testValue = 'test-value';
      
      const setStart = Date.now();
      await redis.set(testKey, testValue, 'EX', 10); // Expire in 10 seconds
      const setLatency = Date.now() - setStart;
      
      // Test GET operation
      const getStart = Date.now();
      const retrievedValue = await redis.get(testKey);
      const getLatency = Date.now() - getStart;
      
      // Cleanup
      await redis.del(testKey);
      
      // Verify GET worked
      const getSuccess = retrievedValue === testValue;
      
      return res.status(200).json({
        status: 'ok',
        message: 'Redis is working correctly',
        redis: {
          configured: true,
          connected: true,
          latency: {
            connection: testResult.latency,
            set: setLatency,
            get: getLatency,
            average: Math.round((testResult.latency + setLatency + getLatency) / 3),
          },
          operations: {
            ping: 'success',
            set: 'success',
            get: getSuccess ? 'success' : 'failed',
          },
          performance: {
            meetsTarget: testResult.latency < 5 && setLatency < 5 && getLatency < 5,
            target: '<5ms',
          },
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(503).json({
        status: 'error',
        message: 'Redis connection test failed',
        redis: {
          configured: true,
          connected: false,
          error: testResult.error,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Redis health check failed',
      redis: {
        configured: true,
        connected: false,
        error: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default healthRouter;

