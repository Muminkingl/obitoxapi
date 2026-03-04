/**
 * worker.js — Cloudflare Workers Entry Point
 *
 * This file replaces app.js for the Cloudflare Workers environment.
 * It uses Hono (a Cloudflare-native Express-like framework) to mount
 * all existing routes exactly as in app.js, without calling app.listen().
 *
 * Background workers (metrics, audit, webhooks, quota-sync) are NOT imported
 * here. They live on DigitalOcean and read from the same Upstash Redis.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';

// ─── Route Handlers ──────────────────────────────────────────────────────────
// These are the same Express routers — Hono is compatible via `hono/node-server`
import apiKeyRouter from './routes/apikey.routes.js';
import uploadRouter from './routes/upload.routes.js';
import analyticsRouter from './routes/analytics.routes.js';
import healthRouter from './routes/health.routes.js';
import monitoringRouter from './routes/monitoring.routes.js';
import webhooksRouter from './routes/webhooks.routes.js';

const app = new Hono();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use('*', cors({
    origin: [
        'https://obitox.dev',
        'https://www.obitox.dev',
        'http://localhost:3000',    // Next.js local dev
        'http://localhost:5173',    // Vite local dev
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
    exposeHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 86400,
}));

// ─── Request Logging (dev only) ───────────────────────────────────────────────
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    app.use('*', honoLogger());
}

// ─── Welcome route ────────────────────────────────────────────────────────────
app.get('/', (c) => c.text(
    'Welcome to ObitoX API! Use /api/v1/apikeys/validate with your API key.'
));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', ts: Date.now() }));

// ─── Mount Express routers via Hono compatibility layer ───────────────────────
// Hono can mount Express-style middleware/routers directly when using the
// `nodejs_compat` compatibility flag in wrangler.toml
app.mount('/api/v1/apikeys', apiKeyRouter);
app.mount('/api/v1/upload', uploadRouter);
app.mount('/api/v1/analytics', analyticsRouter);
app.mount('/api/v1/monitoring', monitoringRouter);
app.mount('/api/v1/webhooks', webhooksRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.onError((err, c) => {
    console.error('[Worker] Unhandled error:', err.message);
    return c.json({ error: 'Internal server error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'Route not found' }, 404));

// ─── Export fetch handler for Cloudflare Workers ─────────────────────────────
// This replaces `app.listen()` — CF Workers call `fetch` automatically
export default app;
