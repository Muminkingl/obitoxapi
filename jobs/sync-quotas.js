/**
 * Background Job: Sync Redis quotas to Supabase database
 *
 * Runs every hour to ensure billing accuracy and provide recovery mechanism
 * if Redis fails.
 *
 * Purpose:
 * - Billing accuracy (disputes, audits)
 * - Analytics (usage over time)
 * - Disaster recovery (if Redis fails)
 *
 * FIXES IN THIS VERSION:
 *   - MGET replaces per-key redis.get() — 1000 round trips → 1 per batch
 *   - getRedis() used at call time instead of import-time default import
 *   - Overlap guard (isRunning) prevents concurrent hourly runs
 *   - setTimeout log moved after sync resolves (was firing immediately)
 *   - Graceful shutdown flushes in-progress sync before exit
 *   - parseInt now uses explicit radix 10
 *   - Fatal error now exits so PM2 can restart cleanly
 *   - getStats() exported for health check / metrics endpoints
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getMonthKey } from '../utils/quota-manager.js';
import logger from '../utils/logger.js';

const WORKER_ID        = `quota-sync-${process.env.HOSTNAME || 'local'}_${process.pid}`;
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_DELAY_MS = 5 * 60 * 1000;  // 5 minutes
const BATCH_SIZE       = 100;

// FIX: Overlap guard — hourly sync should never run concurrently with itself
let isRunning = false;

// Stats exposed via getStats() for health check endpoints
const stats = {
    runsCompleted: 0,
    runsSkipped: 0,
    totalSynced: 0,
    totalErrors: 0,
    lastRunAt: null,
    lastRunDurationMs: null,
    lastRunSynced: 0,
    startedAt: new Date().toISOString()
};

// ─────────────────────────────────────────────
// SCAN helper
// ─────────────────────────────────────────────

/**
 * Non-blocking SCAN helper (replaces redis.keys()).
 * At 10K+ req/min, KEYS blocks Redis for seconds.
 * SCAN iterates incrementally without blocking.
 */
async function scanKeys(redis, pattern) {
    const keys = [];
    let cursor = '0';

    do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = result[0];
        keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
}

// ─────────────────────────────────────────────
// Core sync
// ─────────────────────────────────────────────

/**
 * Sync Redis quotas to Supabase.
 *
 * FIX: Uses MGET to fetch all values in a batch in one Redis round trip
 * instead of individual redis.get() calls per key (N+1 → 1 per batch).
 *
 * FIX: Uses getRedis() at call time — not an import-time default import
 * which may be undefined if Redis isn't connected yet at module load.
 */
export async function syncQuotasToDatabase() {
    // FIX: Overlap guard
    if (isRunning) {
        stats.runsSkipped++;
        logger.warn('[QUOTA SYNC] Previous sync still running, skipping this tick');
        return;
    }

    isRunning = true;
    const startTime = Date.now();
    logger.debug('[QUOTA SYNC] Starting hourly quota sync...');

    // FIX: getRedis() at call time — consistent with all other workers,
    // avoids undefined client if Redis wasn't ready at import time
    const redis = getRedis();
    if (!redis) {
        logger.error('[QUOTA SYNC] Redis not available, skipping sync');
        isRunning = false;
        return;
    }

    const month   = getMonthKey();
    const pattern = `quota:*:${month}`;

    let synced = 0;
    let errors = 0;

    try {
        const keys = await scanKeys(redis, pattern);
        logger.debug(`[QUOTA SYNC] Found ${keys.length} quota keys to sync`);

        if (keys.length === 0) {
            logger.debug('[QUOTA SYNC] No quotas to sync');
            stats.runsCompleted++;
            stats.lastRunAt = new Date().toISOString();
            stats.lastRunDurationMs = Date.now() - startTime;
            stats.lastRunSynced = 0;
            isRunning = false;
            return;
        }

        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);

            // FIX: MGET fetches all values in one Redis call instead of
            // one redis.get() per key — reduces 100 round trips to 1 per batch
            let values;
            try {
                values = await redis.mget(...batch);
            } catch (err) {
                logger.error('[QUOTA SYNC] MGET error:', { message: err.message });
                errors += batch.length;
                continue;
            }

            // Zip keys and values, validate, build upsert rows
            const validData = [];
            for (let j = 0; j < batch.length; j++) {
                const key   = batch[j];
                const value = values[j];

                try {
                    const parts = key.split(':');
                    if (parts.length !== 3) {
                        logger.error(`[QUOTA SYNC] Invalid key format: ${key}`);
                        errors++;
                        continue;
                    }

                    const userId = parts[1];

                    // FIX: parseInt with explicit radix 10
                    const requestCount = parseInt(value || '0', 10);

                    validData.push({
                        user_id:       userId,
                        month,
                        request_count: isNaN(requestCount) ? 0 : requestCount,
                        synced_at:     new Date().toISOString()
                    });
                } catch (err) {
                    logger.error(`[QUOTA SYNC] Error processing key ${key}:`, { message: err.message });
                    errors++;
                }
            }

            if (validData.length === 0) continue;

            const { error } = await supabaseAdmin
                .from('quota_usage')
                .upsert(validData, { onConflict: 'user_id,month' });

            if (error) {
                logger.error('[QUOTA SYNC] Database upsert error:', { message: error.message });
                errors += validData.length;
            } else {
                synced += validData.length;
            }
        }

        const duration = Date.now() - startTime;

        // Update stats
        stats.runsCompleted++;
        stats.totalSynced      += synced;
        stats.totalErrors      += errors;
        stats.lastRunAt        = new Date().toISOString();
        stats.lastRunDurationMs = duration;
        stats.lastRunSynced    = synced;

        logger.debug(`[QUOTA SYNC] Complete! Synced: ${synced}, Errors: ${errors}, Duration: ${duration}ms`);

    } catch (err) {
        stats.totalErrors++;
        logger.error('[QUOTA SYNC] Fatal sync error:', { message: err.message });

        // FIX: Fatal errors now re-throw so the caller (main / setInterval wrapper)
        // can decide whether to exit and let PM2 restart, rather than silently swallowing
        throw err;
    } finally {
        isRunning = false;
    }
}

// ─────────────────────────────────────────────
// Stats export
// ─────────────────────────────────────────────

/**
 * FIX: Exported for use in health check / metrics endpoints.
 * Previously this worker logged but exposed nothing programmatically.
 */
export function getStats() {
    return {
        ...stats,
        workerId:  WORKER_ID,
        uptime:    process.uptime(),
        isRunning
    };
}

// ─────────────────────────────────────────────
// Global error handlers
// ─────────────────────────────────────────────

process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[QUOTA SYNC] ECONNRESET (Redis idle reset, safe to ignore)');
        return;
    }
    logger.error(`[QUOTA SYNC] Uncaught exception: ${msg}`);
    process.exit(1);
});

// FIX: Now exits so PM2 can restart cleanly instead of running broken
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[QUOTA SYNC] ECONNRESET rejection (safe to ignore)');
        return;
    }
    logger.error(`[QUOTA SYNC] Unhandled rejection: ${msg}`);
    process.exit(1);
});

// FIX: Graceful shutdown — waits for in-progress sync to finish before exit
// so a PM2 restart mid-sync doesn't leave quota counts inconsistent
const shutdown = async (signal) => {
    logger.info(`[QUOTA SYNC] Received ${signal}, shutting down...`);

    if (isRunning) {
        logger.info('[QUOTA SYNC] Sync in progress, waiting up to 30s for it to finish...');
        const deadline = Date.now() + 30000;
        while (isRunning && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (isRunning) {
            logger.warn('[QUOTA SYNC] Sync did not finish within 30s, forcing exit');
        } else {
            logger.info('[QUOTA SYNC] In-progress sync completed cleanly');
        }
    }

    logger.info('[QUOTA SYNC] Shutdown complete');
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

logger.info(`[QUOTA SYNC] Worker ${WORKER_ID} starting...`);

// FIX: Overlap-safe interval wrapper — catches fatal errors and exits
// so PM2 can restart rather than the process silently continuing broken
const intervalId = setInterval(async () => {
    try {
        await syncQuotasToDatabase();
    } catch (err) {
        logger.error('[QUOTA SYNC] Sync interval fatal error, exiting for PM2 restart:', { message: err.message });
        clearInterval(intervalId);
        process.exit(1);
    }
}, SYNC_INTERVAL_MS);

// Delay first sync by 5 minutes to avoid startup Redis spike
logger.info('[QUOTA SYNC] First sync scheduled in 5 minutes...');
setTimeout(async () => {
    try {
        // FIX: await the sync before logging completion — previously the log
        // fired immediately after calling syncQuotasToDatabase(), not after it resolved
        await syncQuotasToDatabase();
        logger.info('[QUOTA SYNC] First sync completed (was delayed 5 min to reduce startup load)');
    } catch (err) {
        logger.error('[QUOTA SYNC] First sync failed:', { message: err.message });
    }
}, STARTUP_DELAY_MS);