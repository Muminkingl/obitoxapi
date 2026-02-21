/**
 * Webhook Background Worker
 * 
 * - Processes webhooks from Redis queue every 5 seconds
 * - Handles auto-trigger mode (server polls for files)
 * - Manages dead letter retries
 * - Multi-instance safe with Redis
 */

import logger from '../utils/logger.js';

// Lazy-load dependencies to handle startup errors gracefully
let getRedis, supabaseAdmin, dequeueWebhooks, getQueueStats, processWebhook, processWebhookBatch, retryDeadLetters;

async function loadDependencies() {
    try {
        const redisModule = await import('../config/redis.js');
        getRedis = redisModule.getRedis;

        const supabaseModule = await import('../config/supabase.js');
        supabaseAdmin = supabaseModule.supabaseAdmin;

        const queueModule = await import('../services/webhook/queue-manager.js');
        dequeueWebhooks = queueModule.dequeueWebhooks;
        getQueueStats = queueModule.getQueueStats;

        const processorModule = await import('../services/webhook/processor.js');
        processWebhook = processorModule.processWebhook;
        processWebhookBatch = processorModule.processWebhookBatch;
        retryDeadLetters = processorModule.retryDeadLetters;

        logger.info('[Webhook Worker] Dependencies loaded successfully');
        return true;
    } catch (error) {
        logger.error('[Webhook Worker] Failed to load dependencies:', { message: error.message, stack: error.stack });
        return false;
    }
}

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

        logger.debug(`[Webhook Worker] Processing ${webhooks.length} webhooks...`);

        // 2. Get full webhook records from database
        const webhookIds = webhooks.map(w => w.id);
        const { data: webhookRecords } = await supabaseAdmin
            .from('upload_webhooks')
            .select('*')
            .in('id', webhookIds)
            .in('status', ['pending', 'verifying']);

        if (!webhookRecords || webhookRecords.length === 0) {
            logger.debug('[Webhook Worker] No valid webhooks found in DB');
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

        logger.debug(`[Webhook Worker] Batch complete in ${workerMetrics.lastRunDuration}ms`);

    } catch (error) {
        if (error.message.includes('max requests')) {
            logger.warn('[Webhook Worker] Redis quota exceeded. Pausing...');
            // We just log and return cleanly so the interval will retry later naturally (5s)
            // This prevents consecutiveErrors from incrementing and crashing the worker
            return;
        }

        workerMetrics.errors++;
        logger.error('[Webhook Worker] Error:', { message: error.message });
        throw error; // Re-throw to trigger restart logic
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

        logger.debug(`[Webhook Worker] Found ${autoWebhooks.length} auto-trigger webhooks needing verification`);

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
        logger.error('[Webhook Worker] Auto-handler error:', { message: error.message });
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
        logger.error('[Webhook Worker] Dead letter handler error:', { message: error.message });
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
            logger.debug(`[Webhook Worker] Cleaned up ${data} expired webhooks`);
        }
    } catch (error) {
        // Function might not exist yet, ignore
        logger.debug('[Webhook Worker] Expired webhook cleanup skipped');
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

    logger.info('[Webhook Worker] Metrics:', stats);
}

/**
 * Start the worker
 */
export async function startWebhookWorker() {
    logger.info(`[Webhook Worker] Starting worker ${WORKER_ID}`);
    logger.info(`[Webhook Worker] Processing interval: ${SYNC_INTERVAL_MS}ms`);

    // Load dependencies first
    const loaded = await loadDependencies();
    if (!loaded) {
        logger.error('[Webhook Worker] Failed to load dependencies, exiting...');
        process.exit(1);
    }

    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    // Main processing interval
    const intervalId = setInterval(async () => {
        try {
            await runWorker();
            consecutiveErrors = 0;
        } catch (error) {
            consecutiveErrors++;
            logger.error(`[Webhook Worker] Consecutive errors: ${consecutiveErrors}`);

            if (consecutiveErrors >= maxConsecutiveErrors) {
                logger.error('[Webhook Worker] Too many errors, restarting...');
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
            logger.error('[Webhook Worker] Auto-handler error:', { message: error.message });
        }
    }, AUTO_POLL_INTERVAL_MS);

    // Metrics logging (every 5 minutes)
    const metricsIntervalId = setInterval(logMetrics, 300000);

    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`[Webhook Worker] Received ${signal}, shutting down...`);

        clearInterval(intervalId);
        clearInterval(autoIntervalId);
        clearInterval(metricsIntervalId);

        // Final cleanup
        try {
            await runWorker(); // Process remaining
            await cleanupExpiredWebhooks();
        } catch (error) {
            logger.error('[Webhook Worker] Final cleanup error:', { message: error.message });
        }

        logger.info('[Webhook Worker] Shutdown complete');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions - but don't crash on ECONNRESET (Redis idle reset)
    process.on('uncaughtException', (error) => {
        const msg = error?.message || String(error);
        if (msg.includes('ECONNRESET')) {
            logger.debug('[Webhook Worker] ECONNRESET caught (Redis idle reset, safe to ignore)');
            return; // Don't shut down!
        }
        logger.error('[Webhook Worker] Uncaught exception:', { message: msg, stack: error.stack });
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
        const msg = reason?.message || String(reason);
        if (msg.includes('ECONNRESET')) {
            logger.debug('[Webhook Worker] ECONNRESET rejection (Redis idle reset, safe to ignore)');
            return;
        }
        logger.error('[Webhook Worker] Unhandled rejection:', { reason });
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
        logger.info(`[Webhook Worker] Health check server running on port ${port}`);
    });

    return server;
}

// Always start when run as a worker (by PM2 or directly via node)
// NOTE: process.argv[1] under PM2 fork mode is NOT this file path,
// so we cannot use includes('webhook-worker') as an entry check.
const withHealthServer = process.env.WEBHOOK_HEALTH_SERVER === 'true';
if (withHealthServer) {
    startWebhookWorker();
    startHealthCheckServer();
} else {
    startWebhookWorker();
}
