/**
 * Enterprise Audit Worker
 *
 * Features:
 * - Adaptive batching (scales with queue depth)
 * - Multiple worker support (PM2 cluster)
 * - Real-time metrics and monitoring
 * - Failure recovery (re-queues failed batches)
 * - Health alerts (queue backup, high failures)
 * - Graceful shutdown (flushes buffer on SIGTERM/SIGINT)
 * - Dead letter retry worker (drains audit:failed queue)
 * - Per-instance metrics keys (safe for PM2 cluster)
 *
 * Performance:
 * - Small batch: 100 logs (queue < 1K)
 * - Medium batch: 300 logs (queue < 5K)
 * - Large batch: 1000 logs (queue > 5K)
 *
 * Run with PM2:
 *   pm2 start jobs/audit-worker.js --instances 4
 */

import logger from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getRedis } from '../config/redis.js';

// FIX: Include hostname for uniqueness across containers/pods
const WORKER_ID = `worker_${process.env.HOSTNAME || 'local'}_${process.pid}`;

// FIX: Per-instance metrics key so PM2 cluster instances don't overwrite each other
const METRICS_KEY = `audit:metrics:${WORKER_ID}`;

// Adaptive batch configuration
const BATCH_CONFIG = {
    small: { size: 100, threshold: 1000 },
    medium: { size: 300, threshold: 5000 },
    large: { size: 1000, threshold: 10000 }
};

const BATCH_INTERVAL_MS = 5000; // Max 5 seconds between flushes

// FIX: Max depth for audit:failed to prevent unbounded Redis memory growth
const MAX_FAILED_QUEUE_DEPTH = 50000;

// Metrics tracking
const metrics = {
    queueLength: 0,
    insertsLastMinute: 0,
    failuresLastMinute: 0,
    avgBatchTime: 0,
    droppedEvents: 0,
    overflowEvents: 0,
    currentBatchSize: BATCH_CONFIG.small.size
};

// Shutdown flag — signals the main loop to exit cleanly
let shuttingDown = false;

/**
 * Determine batch size based on queue depth.
 * FIX: Removed unnecessary async — this is pure sync logic.
 */
function getAdaptiveBatchSize(queueLength) {
    if (queueLength > BATCH_CONFIG.large.threshold) return BATCH_CONFIG.large.size;
    if (queueLength > BATCH_CONFIG.medium.threshold) return BATCH_CONFIG.medium.size;
    return BATCH_CONFIG.small.size;
}

/**
 * Main worker loop
 */
async function startAuditWorker() {
    const redis = getRedis();

    if (!redis) {
        logger.error('❌ Redis not available. Worker cannot start.');
        process.exit(1);
    }

    const buffer = [];
    let lastFlush = Date.now();
    let batchSize = BATCH_CONFIG.small.size;

    logger.info(`🔄 Audit worker started: ${WORKER_ID}`);
    logger.info(`📊 Initial batch size: ${batchSize}`);

    // Start background metrics reporter
    startMetricsReporter(redis);

    // FIX #2: Only the primary PM2 instance (pm_id 0) runs the dead letter retrier.
    // With 4 instances each doing 100 rpoplpush every 60s, the same failed items
    // get re-queued up to 4x more aggressively than intended.
    if (!process.env.pm_id || process.env.pm_id === '0') {
        startDeadLetterRetrier(redis);
    }

    // FIX: Graceful shutdown handlers — flush buffer before exiting
    const shutdown = async (signal) => {
        logger.info(`[${WORKER_ID}] Received ${signal}, shutting down gracefully...`);
        shuttingDown = true;

        // Flush whatever is in the buffer
        if (buffer.length > 0) {
            logger.info(`[${WORKER_ID}] Flushing ${buffer.length} remaining logs before exit...`);
            const batch = buffer.splice(0, buffer.length);
            try {
                await flushBatch(redis, batch);
                logger.info(`[${WORKER_ID}] Final flush complete.`);
            } catch (err) {
                logger.error(`[${WORKER_ID}] Final flush failed:`, err.message);
            }
        }

        logger.info(`[${WORKER_ID}] Shutdown complete.`);
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    while (!shuttingDown) {
        try {
            // Blocking pop with 1-second timeout
            const result = await redis.brpop('audit:queue', 1);

            if (result) {
                const [, item] = result;
                buffer.push(JSON.parse(item));
            }

            // Flush conditions: time elapsed OR buffer full
            const timeToFlush = Date.now() - lastFlush >= BATCH_INTERVAL_MS;
            const bufferFull = buffer.length >= batchSize;

            if ((timeToFlush || bufferFull) && buffer.length > 0) {
                // FIX #1: llen moved inside flush condition — only check queue depth
                // when about to flush, not on every loop tick (saves 1 Redis call/sec idle)
                const queueLength = await redis.llen('audit:queue');
                batchSize = getAdaptiveBatchSize(queueLength);
                metrics.queueLength = queueLength;
                metrics.currentBatchSize = batchSize;

                if (queueLength > 5000) {
                    logger.error(`\u{1F6A8} [${WORKER_ID}] Queue backed up: ${queueLength} items! Using large batches (${batchSize}).`);
                }

                // FIX: Snapshot the buffer before flushing so concurrent pushes
                // and the subsequent clear don't race with the async DB insert.
                const batch = buffer.splice(0, buffer.length);

                const batchStart = Date.now();
                await flushBatch(redis, batch);
                const batchTime = Date.now() - batchStart;

                metrics.insertsLastMinute += batch.length;
                metrics.avgBatchTime = batchTime;

                logger.info(`\u2705 [${WORKER_ID}] Flushed ${batch.length} logs in ${batchTime}ms`);

                lastFlush = Date.now();
            }

        } catch (error) {
            logger.error(`[${WORKER_ID}] Error:`, error.message);

            if (error.message.includes('max requests')) {
                logger.warn(`[${WORKER_ID}] ⚠️ Redis quota exceeded. Pausing for 60 seconds...`);
                await sleep(60000);
            } else {
                metrics.failuresLastMinute++;
                await sleep(1000);
            }
        }
    }
}

/**
 * Flush a snapshot batch to the database.
 * On failure, re-queues to audit:failed (with depth cap to prevent Redis OOM).
 */
async function flushBatch(redis, logs) {
    if (logs.length === 0) return;

    try {
        const { error } = await supabaseAdmin
            .from('audit_logs')
            .insert(logs);

        if (error) throw error;

    } catch (error) {
        logger.error(`❌ [${WORKER_ID}] Batch insert failed:`, error.message);
        logger.error(`❌ [${WORKER_ID}] First log entry:`, JSON.stringify(logs[0], null, 2));
        metrics.failuresLastMinute += logs.length;

        // FIX: Check failed queue depth before re-queuing to prevent unbounded growth
        const failedDepth = await redis.llen('audit:failed');
        if (failedDepth >= MAX_FAILED_QUEUE_DEPTH) {
            logger.error(`🚨 [${WORKER_ID}] audit:failed queue at cap (${failedDepth}). Dropping ${logs.length} logs to prevent Redis OOM.`);
            metrics.droppedEvents += logs.length;
            return;
        }

        logger.info(`\u{1F504} [${WORKER_ID}] Re-queuing ${logs.length} failed logs to audit:failed...`);
        // FIX #3: variadic lpush — 1 Redis command instead of N pipeline commands
        const serialized = logs.map(log => JSON.stringify(log));
        await redis.lpush('audit:failed', ...serialized);
    }
}

/**
 * FIX: Dead letter retrier — periodically drains audit:failed back into audit:queue.
 * Previously failed logs were pushed to audit:failed and never retried (silent black hole).
 */
function startDeadLetterRetrier(redis) {
    const RETRY_INTERVAL_MS = 60000;  // Every 60 seconds
    const RETRY_BATCH_SIZE = 100;    // Re-queue up to 100 at a time

    setInterval(async () => {
        if (shuttingDown) return;

        try {
            const failedDepth = await redis.llen('audit:failed');
            if (failedDepth === 0) return;

            logger.info(`🔄 [${WORKER_ID}] Retrying ${Math.min(failedDepth, RETRY_BATCH_SIZE)} failed logs from audit:failed (total: ${failedDepth})`);

            const pipeline = redis.pipeline();
            for (let i = 0; i < Math.min(failedDepth, RETRY_BATCH_SIZE); i++) {
                // Move from failed queue back to main queue atomically
                pipeline.rpoplpush('audit:failed', 'audit:queue');
            }
            await pipeline.exec();

        } catch (error) {
            logger.error(`[${WORKER_ID}] Dead letter retrier error:`, error.message);
        }
    }, RETRY_INTERVAL_MS);
}

/**
 * Background metrics reporter — runs every minute.
 * FIX: Uses per-instance Redis key so PM2 cluster instances don't overwrite each other.
 */
function startMetricsReporter(redis) {
    setInterval(async () => {
        if (shuttingDown) return;

        try {
            const [dropped, overflow, failedDepth] = await Promise.all([
                redis.get('audit:dropped_count'),
                redis.get('audit:overflow_count'),
                redis.llen('audit:failed')
            ]);

            metrics.droppedEvents = parseInt(dropped || '0');
            metrics.overflowEvents = parseInt(overflow || '0');

            // FIX: Per-instance key — was 'audit:metrics' which caused all instances to overwrite each other
            await redis.setex(METRICS_KEY, 120, JSON.stringify({
                ...metrics,
                worker_id: WORKER_ID,
                failed_queue_depth: failedDepth,
                timestamp: new Date().toISOString()
            }));

            logger.info(`📊 [${WORKER_ID}] Metrics:`, {
                queue: metrics.queueLength,
                batch_size: metrics.currentBatchSize,
                inserts: metrics.insertsLastMinute,   // items inserted this minute
                failures: metrics.failuresLastMinute,
                dropped: metrics.droppedEvents,
                overflow: metrics.overflowEvents,
                failed_queue: failedDepth,
                avg_batch_time: `${metrics.avgBatchTime}ms`
            });

            // Critical alerts
            if (metrics.queueLength > 5000) {
                logger.error('🚨 CRITICAL: Audit queue backed up! Consider adding more workers.');
            }
            if (metrics.failuresLastMinute > 100) {
                logger.error('🚨 CRITICAL: High failure rate! Check database connection.');
            }
            if (metrics.droppedEvents > 1000) {
                logger.error('⚠️  WARNING: Events being dropped! System under heavy load.');
            }
            if (failedDepth > 10000) {
                logger.error(`🚨 WARNING: audit:failed queue has ${failedDepth} items. DB may be degraded.`);
            }

            // Reset per-minute counters
            metrics.insertsLastMinute = 0;
            metrics.failuresLastMinute = 0;

        } catch (error) {
            logger.error('Metrics reporter error:', error.message);
        }
    }, 60000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Global error handlers — don't crash on ECONNRESET (Redis idle reset)
process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Audit Worker] ECONNRESET (Redis idle reset, safe to ignore)');
        return;
    }
    logger.error(`Worker crashed: ${msg}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Audit Worker] ECONNRESET rejection (safe to ignore)');
        return;
    }
    logger.error(`Unhandled rejection: ${msg}`);
    // Exit so PM2 can restart cleanly rather than running in a broken state
    process.exit(1);
});

// Always start when run as a worker (by PM2 or directly via node)
// NOTE: process.argv[1] under PM2 fork mode is NOT this file path
startAuditWorker().catch((error) => {
    logger.error(`Worker crashed: ${error.message || error}`);
    console.error(error);
    process.exit(1);
});

export { startAuditWorker };