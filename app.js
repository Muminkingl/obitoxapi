import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT } from './config/env.js';

import apiKeyRouter from './routes/apikey.routes.js';
import uploadRouter from './routes/upload.routes.js';
import analyticsRouter from './routes/analytics.routes.js';
import connectToSupabase from './database/supabase.js';
import errorMiddleware from './middlewares/error.middleware.js';
import arcjetMiddleware from './middlewares/arcjet.middleware.js';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(arcjetMiddleware);

// API routes
app.use('/api/v1/apikeys', apiKeyRouter);
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/analytics', analyticsRouter);

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
});

export default app;