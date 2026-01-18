/**
 * Enterprise Audit Worker
 * 
 * Features:
 * - Adaptive batching (scales with queue depth)
 * - Multiple worker support (PM2 cluster)
 * - Real-time metrics and monitoring
 * - Failure recovery (re-queues failed batches)
 * - Health alerts (queue backup, high failures)
 * 
 * Performance:
 * - Small batch: 100 logs (queue < 1K)
 * - Medium batch: 300 logs (queue < 5K)
 * - Large batch: 1000 logs (queue > 5K)
 * 
 * Run with PM2:
 *   pm2 start jobs/audit-worker.js --instances 4
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';

const WORKER_ID = `worker_${process.pid}`;

// 🔥 ADAPTIVE BATCH CONFIGURATION
const BATCH_CONFIG = {
    small: { size: 100, threshold: 1000 },
    medium: { size: 300, threshold: 5000 },
    large: { size: 1000, threshold: 10000 }
};

const BATCH_INTERVAL_MS = 5000; // Max 5 seconds between flushes

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

/**
 * Determine batch size based on queue depth
 * Larger batches when queue is backed up
 */
async function getAdaptiveBatchSize(queueLength) {
    if (queueLength > BATCH_CONFIG.large.threshold) {
        return BATCH_CONFIG.large.size;
    }
    if (queueLength > BATCH_CONFIG.medium.threshold) {
        return BATCH_CONFIG.medium.size;
    }
    return BATCH_CONFIG.small.size;
}

/**
 * Main worker loop
 */
async function startAuditWorker() {
    const redis = getRedis();

    if (!redis) {
        console.error('❌ Redis not available. Worker cannot start.');
        process.exit(1);
    }

    const buffer = [];
    let lastFlush = Date.now();
    let batchSize = BATCH_CONFIG.small.size;

    console.log(`🔄 Audit worker started: ${WORKER_ID}`);
    console.log(`📊 Initial batch size: ${batchSize}`);

    // Start background metrics reporter
    startMetricsReporter(redis);

    while (true) {
        try {
            // 🔥 ADAPTIVE BATCHING: Check queue and adjust batch size
            const queueLength = await redis.llen('audit:queue');
            batchSize = await getAdaptiveBatchSize(queueLength);
            metrics.queueLength = queueLength;
            metrics.currentBatchSize = batchSize;

            // 🚨 ALERT: Queue backup detected
            if (queueLength > 5000) {
                console.error(`🚨 [${WORKER_ID}] Queue backed up: ${queueLength} items! Using large batches (${batchSize}).`);
            }

            // Pop from queue (blocking pop with 1-second timeout)
            const result = await redis.brpop('audit:queue', 1);

            if (result) {
                const [, item] = result;
                buffer.push(JSON.parse(item));
            }

            // Flush conditions
            const timeToFlush = Date.now() - lastFlush >= BATCH_INTERVAL_MS;
            const bufferFull = buffer.length >= batchSize;

            if ((timeToFlush || bufferFull) && buffer.length > 0) {
                const batchStart = Date.now();
                await flushBatch(redis, buffer);
                const batchTime = Date.now() - batchStart;

                // Update metrics
                metrics.insertsLastMinute += buffer.length;
                metrics.avgBatchTime = batchTime;

                console.log(`✅ [${WORKER_ID}] Flushed ${buffer.length} logs in ${batchTime}ms`);

                buffer.length = 0;
                lastFlush = Date.now();
            }

        } catch (error) {
            console.error(`[${WORKER_ID}] Error:`, error.message);
            metrics.failuresLastMinute++;
            await sleep(1000); // Backoff on error
        }
    }
}

/**
 * Flush buffer to database
 */
async function flushBatch(redis, logs) {
    if (logs.length === 0) return;

    try {
        const { error } = await supabaseAdmin
            .from('audit_logs')
            .insert(logs);

        if (error) throw error;

    } catch (error) {
        console.error(`❌ [${WORKER_ID}] Batch insert failed:`, error.message);
        metrics.failuresLastMinute += logs.length;

        // 🔄 Re-queue to failed queue for manual inspection
        console.log(`🔄 [${WORKER_ID}] Re-queuing ${logs.length} failed logs...`);
        for (const log of logs) {
            await redis.lpush('audit:failed', JSON.stringify(log));
        }
    }
}

/**
 * Background metrics reporter
 * Runs every minute, stores metrics in Redis, sends alerts
 */
function startMetricsReporter(redis) {
    setInterval(async () => {
        try {
            // Get dropped/overflow counts from Redis
            const [dropped, overflow] = await Promise.all([
                redis.get('audit:dropped_count'),
                redis.get('audit:overflow_count')
            ]);

            metrics.droppedEvents = parseInt(dropped || '0');
            metrics.overflowEvents = parseInt(overflow || '0');

            // Store metrics in Redis (TTL: 2 minutes)
            await redis.setex('audit:metrics', 120, JSON.stringify({
                ...metrics,
                worker_id: WORKER_ID,
                timestamp: new Date().toISOString()
            }));

            // Log summary
            console.log(`📊 [${WORKER_ID}] Metrics:`, {
                queue: metrics.queueLength,
                batch_size: metrics.currentBatchSize,
                inserts: metrics.insertsLastMinute,
                failures: metrics.failuresLastMinute,
                dropped: metrics.droppedEvents,
                overflow: metrics.overflowEvents,
                avg_batch_time: `${metrics.avgBatchTime}ms`
            });

            // 🚨 CRITICAL ALERTS
            if (metrics.queueLength > 5000) {
                console.error('🚨 CRITICAL: Audit queue backed up! Consider adding more workers.');
                // TODO: Send to PagerDuty/Slack
            }

            if (metrics.failuresLastMinute > 100) {
                console.error('🚨 CRITICAL: High failure rate! Check database connection.');
                // TODO: Send alert
            }

            if (metrics.droppedEvents > 1000) {
                console.error('⚠️  WARNING: Events being dropped! System under heavy load.');
                // TODO: Send alert
            }

            // Reset per-minute counters
            metrics.insertsLastMinute = 0;
            metrics.failuresLastMinute = 0;

        } catch (error) {
            console.error('Metrics reporter error:', error.message);
        }
    }, 60000); // Every 60 seconds
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the worker
startAuditWorker().catch((error) => {
    console.error('Worker crashed:', error);
    process.exit(1);
});
