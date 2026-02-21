import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Validate environment variables at startup
import { validateEnv } from './utils/env-validator.js';
validateEnv();

import { PORT } from './config/env.js';
import { getCorsOptions, corsWithVaryHeaders } from './middlewares/cors.middleware.js';
import logger from './utils/logger.js';

import apiKeyRouter from './routes/apikey.routes.js';
import uploadRouter from './routes/upload.routes.js';
import analyticsRouter from './routes/analytics.routes.js';
import healthRouter from './routes/health.routes.js';
import monitoringRouter from './routes/monitoring.routes.js';
import webhooksRouter from './routes/webhooks.routes.js';
import connectToSupabase from './database/supabase.js';
import errorMiddleware from './middlewares/error.middleware.js';
import arcjetMiddleware from './middlewares/arcjet.middleware.js';
import { getRedis, testRedisConnection } from './config/redis.js';

// Import quota sync job (starts automatically on import)
import './jobs/sync-quotas.js';

// Import metrics worker
import { startMetricsSyncWorker } from './jobs/metrics-worker.js';

const app = express();

// ✅ IMPROVED: CORS middleware comes FIRST for optimal preflight handling
// Preflight OPTIONS requests don't have a body, so this saves CPU cycles
app.use(cors(getCorsOptions()));

// Vary headers for better CORS caching
app.use(corsWithVaryHeaders());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

app.use(arcjetMiddleware);

// Health check routes (no auth required)
app.use('/health', healthRouter);

// API routes
app.use('/api/v1/apikeys', apiKeyRouter);
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/monitoring', monitoringRouter);
app.use('/api/v1/webhooks', webhooksRouter);

// Error handling
app.use(errorMiddleware);

// Welcome route
app.get('/', (req, res) => {
  res.send('Welcome to the API! Use the /api/v1/apikeys/validate endpoint with your API key to validate it.');
});

// Start server
app.listen(PORT, async () => {
  logger.info(`API is running on http://localhost:${PORT}`);

  // Connect to Supabase
  await connectToSupabase();

  // Initialize Redis connection
  const redis = getRedis();
  if (redis) {
    try {
      // Test Redis connection (non-blocking)
      const testResult = await testRedisConnection();
      if (testResult.success) {
        logger.info(`Redis: Connected (latency: ${testResult.latency}ms)`);

        // Delay metrics sync worker by 1 minute to avoid startup Redis spike
        // This prevents 60-90 Redis reads during app initialization
        setTimeout(() => {
          startMetricsSyncWorker();
          logger.debug('Metrics sync worker started (was delayed 1 min to reduce startup load)');
        }, 60 * 1000);
        logger.debug('Metrics sync worker scheduled in 1 minute...');
      } else {
        logger.warn(`Redis: Connection test failed - ${testResult.error}. Caching will be disabled until Redis is available`);
      }
    } catch (error) {
      logger.warn(`Redis: Initialization error - ${error.message}. Caching will be disabled until Redis is available`);
    }
  } else {
    logger.warn('Redis: Not configured. Caching will be disabled. Set REDIS_URL or UPSTASH_REDIS_URL in .env.local to enable caching');
  }
});

export default app;