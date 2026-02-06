/**
 * Webhook Background Worker
 * 
 * - Processes webhooks from Redis queue every 5 seconds
 * - Handles auto-trigger mode (server polls for files)
 * - Manages dead letter retries
 * - Multi-instance safe with Redis
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { dequeueWebhooks, getQueueStats } from '../services/webhook/queue-manager.js';
import { processWebhook, processWebhookBatch, retryDeadLetters } from '../services/webhook/processor.js';

const WORKER_ID = `webhook_${process.pid}`;
const BATCH_SIZE = 100;
const SYNC_INTERVAL_MS = 5000; // 5 seconds
const AUTO_POLL_INTERVAL_MS = 10000; // 10 seconds for auto mode

// Metrics tracking
const workerMetrics = {
    webhooksProcessed: 0,
    webhooksSucceeded: 0,
    webhooksFailed: 0,
    deadLettersRetried: 0,
    errors: 0,
    lastRunDuration: 0,
    lastRunAt: null
};

/**
 * Main worker function
 */
async function runWorker() {
    const startTime = Date.now();
    
    try {
        // 1. Get webhooks from Redis queue
        const webhooks = await dequeueWebhooks(BATCH_SIZE);

        if (webhooks.length === 0) {
            return;
        }

        console.log(`[Webhook Worker] 📦 Processing ${webhooks.length} webhooks...`);

        // 2. Get full webhook records from database
        const webhookIds = webhooks.map(w => w.id);
        const { data: webhookRecords } = await supabaseAdmin
            .from('upload_webhooks')
            .select('*')
            .in('id', webhookIds)
            .in('status', ['pending', 'verifying']);

        if (!webhookRecords || webhookRecords.length === 0) {
            console.log('[Webhook Worker] ⚠️ No valid webhooks found in DB');
            return;
        }

        // 3. Create a map for quick lookup
        const webhookMap = new Map(webhookRecords.map(w => [w.id, w]));

        // 4. Filter to only webhooks we have records for
        const validWebhooks = webhooks
            .filter(w => webhookMap.has(w.id))
            .map(w => webhookMap.get(w.id));

        // 5. Process batch
        const result = await processWebhookBatch(validWebhooks);

        // Update metrics
        workerMetrics.webhooksProcessed += result.successful + result.failed;
        workerMetrics.webhooksSucceeded += result.successful;
        workerMetrics.webhooksFailed += result.failed;
        workerMetrics.lastRunDuration = Date.now() - startTime;
        workerMetrics.lastRunAt = new Date().toISOString();

        console.log(`[Webhook Worker] ✅ Batch complete in ${workerMetrics.lastRunDuration}ms`);

    } catch (error) {
        workerMetrics.errors++;
        console.error('[Webhook Worker] ❌ Error:', error.message);
    }
}

/**
 * Handle auto-trigger webhooks (server polls for files)
 */
async function handleAutoWebhooks() {
    try {
        // Find webhooks pending verification
        const { data: autoWebhooks } = await supabaseAdmin
            .from('upload_webhooks')
            .select('id')
            .eq('status', 'verifying')
            .eq('trigger_mode', 'auto')
            .lt('expires_at', new Date().toISOString())
            .limit(50);

        if (!autoWebhooks || autoWebhooks.length === 0) {
            return;
        }

        console.log(`[Webhook Worker] 🔄 Found ${autoWebhooks.length} auto-trigger webhooks needing verification`);

        // Queue them for processing
        for (const w of autoWebhooks) {
            const { data: webhook } = await supabaseAdmin
                .from('upload_webhooks')
                .select('*')
                .eq('id', w.id)
                .single();

            if (webhook) {
                await supabaseAdmin
                    .from('upload_webhooks')
                    .update({ status: 'pending' })
                    .eq('id', w.id);
            }
        }

    } catch (error) {
        console.error('[Webhook Worker] ❌ Auto-handler error:', error.message);
    }
}

/**
 * Handle dead letter retries
 */
async function handleDeadLetters() {
    try {
        const retried = await retryDeadLetters(20);
        if (retried > 0) {
            workerMetrics.deadLettersRetried += retried;
        }
    } catch (error) {
        console.error('[Webhook Worker] ❌ Dead letter handler error:', error.message);
    }
}

/**
 * Cleanup expired webhooks
 */
async function cleanupExpiredWebhooks() {
    try {
        const { data } = await supabaseAdmin
            .rpc('cleanup_expired_webhooks');

        if (data && data > 0) {
            console.log(`[Webhook Worker] 🧹 Cleaned up ${data} expired webhooks`);
        }
    } catch (error) {
        // Function might not exist yet, ignore
        console.log('[Webhook Worker] ℹ️ Expired webhook cleanup skipped');
    }
}

/**
 * Log worker metrics
 */
function logMetrics() {
    const stats = {
        workerId: WORKER_ID,
        processed: workerMetrics.webhooksProcessed,
        succeeded: workerMetrics.webhooksSucceeded,
        failed: workerMetrics.webhooksFailed,
        deadLetters: workerMetrics.deadLettersRetried,
        errors: workerMetrics.errors,
        lastDuration: workerMetrics.lastRunDuration,
        uptime: process.uptime()
    };

    console.log(`[Webhook Worker] 📊 Metrics:`, JSON.stringify(stats));
}

/**
 * Start the worker
 */
export function startWebhookWorker() {
    console.log(`[Webhook Worker] 🚀 Starting worker ${WORKER_ID}`);
    console.log(`[Webhook Worker] ⏰ Processing interval: ${SYNC_INTERVAL_MS}ms`);

    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    // Main processing interval
    const intervalId = setInterval(async () => {
        try {
            await runWorker();
            consecutiveErrors = 0;
        } catch (error) {
            consecutiveErrors++;
            console.error(`[Webhook Worker] ❌ Consecutive errors: ${consecutiveErrors}`);

            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error('[Webhook Worker] 💥 Too many errors, restarting...');
                clearInterval(intervalId);
                process.exit(1);
            }
        }
    }, SYNC_INTERVAL_MS);

    // Auto-webhook handler (less frequent)
    const autoIntervalId = setInterval(async () => {
        try {
            await handleAutoWebhooks();
            await handleDeadLetters();
        } catch (error) {
            console.error('[Webhook Worker] ❌ Auto-handler error:', error.message);
        }
    }, AUTO_POLL_INTERVAL_MS);

    // Metrics logging (every 5 minutes)
    const metricsIntervalId = setInterval(logMetrics, 300000);

    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`[Webhook Worker] 🛑 Received ${signal}, shutting down...`);
        
        clearInterval(intervalId);
        clearInterval(autoIntervalId);
        clearInterval(metricsIntervalId);

        // Final cleanup
        try {
            await runWorker(); // Process remaining
            await cleanupExpiredWebhooks();
        } catch (error) {
            console.error('[Webhook Worker] ❌ Final cleanup error:', error.message);
        }

        console.log('[Webhook Worker] ✅ Shutdown complete');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('[Webhook Worker] 💥 Uncaught exception:', error);
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
        console.error('[Webhook Worker] 💥 Unhandled rejection:', reason);
    });

    return intervalId;
}

/**
 * Get worker metrics for monitoring
 */
export function getWorkerMetrics() {
    return {
        ...workerMetrics,
        workerId: WORKER_ID,
        uptime: process.uptime()
    };
}

/**
 * Health check endpoint for PM2/K8s
 * 
 * ✅ ADDED: Health check endpoint for container orchestration
 * 
 * @param {Object} options - Health check options
 * @returns {Promise<Object>} Health status
 */
export async function healthCheck(options = {}) {
    const { checkRedis = true, checkDatabase = true } = options;

    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        workerId: WORKER_ID,
        uptime: process.uptime(),
        checks: {}
    };

    try {
        // Check Redis connectivity
        if (checkRedis) {
            const redis = getRedis();
            if (redis?.status === 'ready') {
                await redis.ping();
                health.checks.redis = { status: 'healthy' };
            } else {
                health.checks.redis = { status: 'unhealthy', reason: 'Redis not connected' };
                health.status = 'degraded';
            }
        }

        // Check Database connectivity
        if (checkDatabase) {
            try {
                const { error } = await supabaseAdmin
                    .from('upload_webhooks')
                    .select('id')
                    .limit(1);

                if (error && error.code !== 'PGRST301') { // Ignore table not found
                    throw error;
                }
                health.checks.database = { status: 'healthy' };
            } catch (dbError) {
                health.checks.database = { 
                    status: 'unhealthy', 
                    reason: dbError instanceof Error ? dbError.message : 'Unknown error' 
                };
                health.status = 'unhealthy';
            }
        }

        // Add metrics to health check
        health.metrics = {
            processed: workerMetrics.webhooksProcessed,
            succeeded: workerMetrics.webhooksSucceeded,
            failed: workerMetrics.webhooksFailed,
            errors: workerMetrics.errors,
            lastRunAt: workerMetrics.lastRunAt
        };

        return health;
    } catch (error) {
        return {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            workerId: WORKER_ID,
            error: error instanceof Error ? error.message : 'Unknown error',
            checks: {}
        };
    }
}

/**
 * Start HTTP server for health checks (optional)
 * 
 * @param {number} port - Port for health check server
 * @returns {http.Server}
 */
export function startHealthCheckServer(port = 3001) {
    const http = require('http');

    const server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
            const health = await healthCheck();
            const statusCode = health.status === 'healthy' ? 200 : 
                               health.status === 'degraded' ? 200 : 503;
            res.writeHead(statusCode);
            res.end(JSON.stringify(health, null, 2));
            return;
        }

        if (req.method === 'GET' && req.url === '/metrics') {
            res.writeHead(200);
            res.end(JSON.stringify(getWorkerMetrics(), null, 2));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(port, () => {
        console.log(`[Webhook Worker] 🏥 Health check server running on port ${port}`);
    });

    return server;
}

// Run if called directly
if (process.argv[1]?.includes('webhook-worker')) {
    // Check if running with health server
    const withHealthServer = process.env.WEBHOOK_HEALTH_SERVER === 'true';
    
    if (withHealthServer) {
        startWebhookWorker();
        startHealthCheckServer();
    } else {
        startWebhookWorker();
    }
}
