import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT } from './config/env.js';

import apiKeyRouter from './routes/apikey.routes.js';
import uploadRouter from './routes/upload.routes.js';
import analyticsRouter from './routes/analytics.routes.js';
import healthRouter from './routes/health.routes.js';
import monitoringRouter from './routes/monitoring.routes.js';
import connectToSupabase from './database/supabase.js';
import errorMiddleware from './middlewares/error.middleware.js';
import arcjetMiddleware from './middlewares/arcjet.middleware.js';
import { getRedis, testRedisConnection } from './config/redis.js';

// Import quota sync job (starts automatically on import)
import './jobs/sync-quotas.js';

const app = express();

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

// Error handling
app.use(errorMiddleware);

// Welcome route
app.get('/', (req, res) => {
  res.send('Welcome to the API! Use the /api/v1/apikeys/validate endpoint with your API key to validate it.');
});

// Start server
app.listen(PORT, async () => {
  console.log(`API is running on http://localhost:${PORT}`);
  console.log(`API key validation available at: http://localhost:${PORT}/api/v1/apikeys/validate?apiKey=ox_your_key_here`);

  // Connect to Supabase
  await connectToSupabase();

  // Initialize Redis connection
  const redis = getRedis();
  if (redis) {
    try {
      // Test Redis connection (non-blocking)
      const testResult = await testRedisConnection();
      if (testResult.success) {
        console.log(`✅ Redis: Connected (latency: ${testResult.latency}ms)`);
      } else {
        console.warn(`⚠️  Redis: Connection test failed - ${testResult.error}`);
        console.warn('   Caching will be disabled until Redis is available');
      }
    } catch (error) {
      console.warn(`⚠️  Redis: Initialization error - ${error.message}`);
      console.warn('   Caching will be disabled until Redis is available');
    }
  } else {
    console.warn('⚠️  Redis: Not configured. Caching will be disabled.');
    console.warn('   Set REDIS_URL or UPSTASH_REDIS_URL in .env.local to enable caching');
  }
});

export default app;