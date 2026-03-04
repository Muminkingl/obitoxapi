/**
 * worker.js — Cloudflare Workers Entry Point (Pure Hono, No Express)
 *
 * The ONLY reason the previous version failed was that `app.mount()` pulled in
 * Express Router → body-parser → raw-body → iconv-lite → readable-stream (unsupported).
 *
 * Fix: import controller FUNCTIONS and middleware FUNCTIONS directly.
 * None of the controller/middleware files import `express` themselves.
 * We bypass the route files (routes/*.js) entirely — they're the Express wrappers.
 *
 * We provide a thin adapt() shim that converts Hono's `c` context into the
 * Express-compatible {req, res, next} shape that all controllers/middlewares expect.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// ─── Middlewares (no Express import in these files!) ──────────────────────────
import apiKeyMiddleware from './middlewares/apikey.middleware.optimized.js';
import { signatureValidator } from './middlewares/signature-validator.middleware.js';
import { unifiedRateLimitMiddleware } from './middlewares/rate-limiter.middleware.js';

// ─── API Key Controllers ──────────────────────────────────────────────────────
import { validateApiKey, validateApiKeyPost } from './controllers/apikey.controller.js';

// ─── Analytics Controllers ────────────────────────────────────────────────────
import { getUploadAnalytics, getDailyUsageAnalytics, getProviderUsageAnalytics } from './controllers/analytics.controller.js';

// ─── Validation Controllers ───────────────────────────────────────────────────
import { validateFile, validateFilesBatch, validateAndGenerateSignedUrl, getSupportedTypes } from './controllers/validation.controller.js';

// ─── Supabase Controllers ─────────────────────────────────────────────────────
import {
    uploadToSupabaseStorage, generateSupabaseSignedUrl, deleteSupabaseFile,
    downloadSupabaseFile, listSupabaseFiles, cancelSupabaseUpload,
    listSupabaseBuckets, completeSupabaseUpload,
} from './controllers/providers/supabase/index.js';

// ─── Uploadcare Controllers ───────────────────────────────────────────────────
import {
    generateUploadcareSignedUrl, deleteUploadcareFile, downloadUploadcareFile,
    listUploadcareFiles, scanUploadcareFileForMalware, checkUploadcareMalwareScanStatus,
    getUploadcareMalwareScanResults, removeUploadcareInfectedFile, validateUploadcareFile,
    getUploadcareProjectSettings, validateUploadcareSvg, uploadcareHealthCheck,
    trackUploadcareEvent,
} from './controllers/providers/uploadcare/index.js';

// ─── R2 Controllers ───────────────────────────────────────────────────────────
import {
    generateR2SignedUrl, deleteR2File, downloadR2File, listR2Files,
    generateR2DownloadUrl, generateR2AccessToken, revokeR2AccessToken,
    generateR2BatchSignedUrls, batchDeleteR2Files,
} from './controllers/providers/r2/index.js';

// ─── S3 Controllers ───────────────────────────────────────────────────────────
import { generateS3SignedUrl } from './controllers/providers/s3/s3.signed-url.js';
import { initiateS3MultipartUpload, completeS3MultipartUpload, abortS3MultipartUpload } from './controllers/providers/s3/s3.multipart.js';
import { generateS3DownloadUrl } from './controllers/providers/s3/s3.download.js';
import { deleteS3File, batchDeleteS3Files } from './controllers/providers/s3/s3.delete.js';
import { listS3Files } from './controllers/providers/s3/s3.list.js';
import { getS3Metadata } from './controllers/providers/s3/s3.metadata.js';
import { generateS3BatchSignedUrls } from './controllers/providers/s3/s3.batch-signed-url.js';
import { setupS3BucketCors, verifyS3BucketCors, setupR2BucketCors, verifyR2BucketCors } from './middlewares/cors.middleware.js';

// ─── Webhook Controllers ──────────────────────────────────────────────────────
import { confirmUploadWebhook, getWebhookStatus, listWebhooks, createWebhook, deleteWebhook, retryWebhook } from './controllers/webhooks/confirm.controller.js';

// ─── Monitoring ───────────────────────────────────────────────────────────────
import { getRedis, testRedisConnection } from './config/redis.js';

// ─── R2 Token Middleware ──────────────────────────────────────────────────────
import { validateR2AccessToken, requireR2Permission } from './middlewares/r2-token.middleware.js';

// =============================================================================
// HONO APP
// =============================================================================

const app = new Hono();

// CORS — must come before any routes
app.use('*', cors({
    origin: ['https://obitox.dev', 'https://www.obitox.dev', 'http://localhost:3000', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key', 'X-Signature', 'X-Timestamp', 'X-Requested-With'],
    exposeHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 86400,
}));

// =============================================================================
// ADAPT — converts Hono context → Express-compatible req / res / next
// =============================================================================

/**
 * Wraps a chain of Express-style (req, res, next) handlers into a Hono handler.
 * Body is parsed by Hono (no body-parser!), then put on req.body.
 */
function chain(...handlers) {
    return async (c) => {
        // ── Parse body (Hono native, no body-parser/iconv-lite!) ──────────────
        const method = c.req.method;
        let body = {};
        try {
            const ct = c.req.header('content-type') || '';
            if (['POST', 'PUT', 'PATCH'].includes(method) && ct.includes('application/json')) {
                body = await c.req.json();
            }
        } catch { /* empty body or non-JSON */ }

        // ── Build Express-compat req ──────────────────────────────────────────
        const url = new URL(c.req.url);
        const req = {
            method,
            url: c.req.url,
            headers: new Proxy({}, {
                get: (_, key) => c.req.header(typeof key === 'string' ? key.toLowerCase() : key),
                has: (_, key) => c.req.header(typeof key === 'string' ? key.toLowerCase() : key) !== undefined,
            }),
            body,
            params: c.req.param(),
            query: Object.fromEntries(url.searchParams),
            // These are set by the API key middleware during the chain:
            userId: undefined,
            apiKeyId: undefined,
            secretHash: undefined,
            user: undefined,
            tier: undefined,
            profile: undefined,
        };

        // ── Build Express-compat res ──────────────────────────────────────────
        let settled = false;
        let response;
        const res = {
            _status: 200,
            status(code) { this._status = code; return this; },
            json(data) {
                if (!settled) { settled = true; response = c.json(data, this._status); }
                return this;
            },
            send(data) {
                if (!settled) { settled = true; response = c.text(String(data), this._status); }
                return this;
            },
            setHeader() { return this; },
            set() { return this; },
            end() { return this; },
        };

        // ── Run middleware chain ──────────────────────────────────────────────
        let idx = 0;
        const next = async (err) => {
            if (err) {
                settled = true;
                response = c.json({ error: err.message || 'Internal error', success: false }, 500);
                return;
            }
            if (idx < handlers.length && !settled) {
                try {
                    await handlers[idx++](req, res, next);
                } catch (e) {
                    settled = true;
                    response = c.json({ error: e.message, success: false }, 500);
                }
            }
        };
        await next();

        return response ?? c.json({ error: 'No response generated' }, 500);
    };
}

// Shorthand: auth + rate-limit + signature → controller
const secured = (...ctrl) => chain(apiKeyMiddleware, unifiedRateLimitMiddleware, signatureValidator, ...ctrl);
const authed = (...ctrl) => chain(apiKeyMiddleware, unifiedRateLimitMiddleware, ...ctrl);
const pub = (...ctrl) => chain(...ctrl);

// =============================================================================
// ROUTES
// =============================================================================

// ── Root & Health ─────────────────────────────────────────────────────────────
app.get('/', (c) => c.text('Welcome to ObitoX API! Use /api/v1/apikeys/validate with your API key.'));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime?.() ?? 0 }));

app.get('/health/redis', async (c) => {
    try {
        const redis = getRedis();
        if (!redis) return c.json({ status: 'unavailable', redis: { configured: false } }, 503);
        const result = await testRedisConnection();
        return result.success
            ? c.json({ status: 'ok', redis: { configured: true, connected: true, latency: result.latency } })
            : c.json({ status: 'error', redis: { configured: true, connected: false, error: result.error } }, 503);
    } catch (e) {
        return c.json({ status: 'error', error: e.message }, 500);
    }
});

// ── API Key Validation ────────────────────────────────────────────────────────
app.get('/api/v1/apikeys/validate', chain(apiKeyMiddleware, validateApiKey));
app.post('/api/v1/apikeys/validate', chain(apiKeyMiddleware, validateApiKeyPost));

// ── File Validation (public endpoint) ────────────────────────────────────────
app.get('/api/v1/upload/validate/supported-types', pub(getSupportedTypes));
app.post('/api/v1/upload/validate', secured(validateFile));
app.post('/api/v1/upload/validate/batch', secured(validateFilesBatch));
app.post('/api/v1/upload/validate/signed-url', secured(validateAndGenerateSignedUrl));

// ── Supabase ──────────────────────────────────────────────────────────────────
app.post('/api/v1/upload/supabase/signed-url', secured(generateSupabaseSignedUrl));
app.post('/api/v1/upload/supabase/upload', secured(uploadToSupabaseStorage));
app.post('/api/v1/upload/supabase/cancel', secured(cancelSupabaseUpload));
app.post('/api/v1/upload/supabase/delete', secured(deleteSupabaseFile));
app.post('/api/v1/upload/supabase/list', secured(listSupabaseFiles));
app.post('/api/v1/upload/supabase/download', secured(downloadSupabaseFile));
app.post('/api/v1/upload/supabase/buckets', secured(listSupabaseBuckets));
app.post('/api/v1/upload/supabase/complete', secured(completeSupabaseUpload));

// ── Uploadcare ────────────────────────────────────────────────────────────────
app.get('/api/v1/upload/uploadcare/health', pub(uploadcareHealthCheck));
app.post('/api/v1/upload/uploadcare/signed-url', secured(generateUploadcareSignedUrl));
app.delete('/api/v1/upload/uploadcare/delete', secured(deleteUploadcareFile));
app.post('/api/v1/upload/uploadcare/download', secured(downloadUploadcareFile));
app.post('/api/v1/upload/uploadcare/list', secured(listUploadcareFiles));
app.post('/api/v1/upload/uploadcare/scan-malware', secured(scanUploadcareFileForMalware));
app.post('/api/v1/upload/uploadcare/scan-status', secured(checkUploadcareMalwareScanStatus));
app.post('/api/v1/upload/uploadcare/scan-results', secured(getUploadcareMalwareScanResults));
app.post('/api/v1/upload/uploadcare/remove-infected', secured(removeUploadcareInfectedFile));
app.post('/api/v1/upload/uploadcare/validate', secured(validateUploadcareFile));
app.post('/api/v1/upload/uploadcare/project-settings', secured(getUploadcareProjectSettings));
app.post('/api/v1/upload/uploadcare/validate-svg', secured(validateUploadcareSvg));
app.post('/api/v1/upload/uploadcare/track', secured(trackUploadcareEvent));

// ── Cloudflare R2 ─────────────────────────────────────────────────────────────
app.post('/api/v1/upload/r2/signed-url', secured(generateR2SignedUrl));
app.post('/api/v1/upload/r2/delete', secured(deleteR2File));
app.post('/api/v1/upload/r2/download', secured(downloadR2File));
app.post('/api/v1/upload/r2/list', secured(listR2Files));
app.post('/api/v1/upload/r2/download-url', secured(generateR2DownloadUrl));
app.post('/api/v1/upload/r2/access-token', secured(generateR2AccessToken));
app.delete('/api/v1/upload/r2/access-token/revoke', secured(revokeR2AccessToken));
app.post('/api/v1/upload/r2/batch/signed-urls', secured(generateR2BatchSignedUrls));
app.post('/api/v1/upload/r2/batch/delete', secured(batchDeleteR2Files));
app.post('/api/v1/upload/r2/cors/setup', authed(setupR2BucketCors));
app.post('/api/v1/upload/r2/cors/verify', authed(verifyR2BucketCors));

// ── AWS S3 ────────────────────────────────────────────────────────────────────
app.post('/api/v1/upload/s3/signed-url', secured(generateS3SignedUrl));
app.post('/api/v1/upload/s3/batch-signed-url', secured(generateS3BatchSignedUrls));
app.post('/api/v1/upload/s3/multipart/initiate', secured(initiateS3MultipartUpload));
app.post('/api/v1/upload/s3/multipart/complete', secured(completeS3MultipartUpload));
app.post('/api/v1/upload/s3/multipart/abort', secured(abortS3MultipartUpload));
app.post('/api/v1/upload/download/s3/signed-url', secured(generateS3DownloadUrl));
app.delete('/api/v1/upload/s3/delete', secured(deleteS3File));
app.post('/api/v1/upload/s3/batch-delete', secured(batchDeleteS3Files));
app.post('/api/v1/upload/s3/list', secured(listS3Files));
app.post('/api/v1/upload/s3/metadata', secured(getS3Metadata));
app.post('/api/v1/upload/s3/cors/setup', authed(setupS3BucketCors));
app.post('/api/v1/upload/s3/cors/verify', authed(verifyS3BucketCors));

// ── Analytics ─────────────────────────────────────────────────────────────────
app.get('/api/v1/analytics', secured(getUploadAnalytics));
app.get('/api/v1/analytics/daily', secured(getDailyUsageAnalytics));
app.get('/api/v1/analytics/providers', secured(getProviderUsageAnalytics));
app.get('/api/v1/upload/analytics', secured(getUploadAnalytics));
app.get('/api/v1/upload/analytics/daily', secured(getDailyUsageAnalytics));
app.get('/api/v1/upload/analytics/providers', secured(getProviderUsageAnalytics));

// Legacy stats
app.get('/api/v1/upload/stats', authed((req, res) => {
    res.json({ success: true, message: 'Deprecated. Use /api/v1/analytics instead.', redirect: '/api/v1/analytics' });
}));

// ── Upload Tracking ───────────────────────────────────────────────────────────
app.post('/api/v1/upload/track', secured(trackUploadcareEvent));

// ── Webhooks ──────────────────────────────────────────────────────────────────
app.post('/api/v1/webhooks/confirm', secured(confirmUploadWebhook));
app.post('/api/v1/webhooks/create', secured(createWebhook));
app.get('/api/v1/webhooks/list', secured(listWebhooks));
app.get('/api/v1/webhooks/status/:id', secured(getWebhookStatus));
app.post('/api/v1/webhooks/:id/retry', secured(retryWebhook));
app.delete('/api/v1/webhooks/:id', secured(deleteWebhook));

// ── Legacy signed-url ─────────────────────────────────────────────────────────
app.post('/api/v1/upload/signed-url', secured(generateSupabaseSignedUrl));

// =============================================================================
// ERROR HANDLERS
// =============================================================================

app.onError((err, c) => {
    console.error('[Worker] Unhandled error:', err.message);
    return c.json({ error: 'Internal server error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'Route not found', path: new URL(c.req.url).pathname }, 404));

// =============================================================================
// EXPORT — CF Workers fetch handler
// =============================================================================
export default app;
