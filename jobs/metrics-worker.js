/**
 * Metrics Sync Worker (v5 - FIXED)
 *
 * Syncs consolidated Redis metrics to database periodically.
 *
 * KEY FORMAT: m:{apiKeyId}:{YYYY-MM-DD}
 * HASH FIELDS:
 *   req          - total request count
 *   p:{provider} - per-provider count (e.g., p:uploadcare, p:s3)
 *   ts           - last activity timestamp
 *   uid          - user ID
 *
 * FIXES IN THIS VERSION:
 *   - Run overlap guard (isRunning flag) prevents concurrent sync pile-up
 *   - N+1 queries replaced with batch upserts
 *   - Redis keys cleared ONLY after all DB writes confirmed
 *   - lastUsedAt validated before new Date() to prevent mid-loop crash
 *   - unhandledRejection now exits so PM2 can restart cleanly
 *   - Per-window stats (reset every 5 min) alongside lifetime totals
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
    getPendingMetrics,
    parseMetricsKey,
    parseMetricsData,
    getMetrics,
    clearMetrics
} from '../lib/metrics/redis-counters.js';
import logger from '../utils/logger.js';

const WORKER_ID = `metrics-worker-${process.env.HOSTNAME || 'local'}_${process.pid}`;
const SYNC_INTERVAL_MS = 5000;   // 5 seconds
const STATS_LOG_INTERVAL = 300000; // 5 minutes

// FIX: Overlap guard — prevents a slow run from piling up with the next interval tick
let isRunning = false;

// Lifetime stats (never reset — useful for uptime/health dashboards)
const lifetimeStats = {
    runsCompleted: 0,
    runsSkipped: 0,
    apiKeysProcessed: 0,
    providersProcessed: 0,
    errors: 0,
    startedAt: new Date().toISOString()
};

// FIX: Per-window stats reset every 5 minutes so logs reflect recent activity
const windowStats = {
    runsCompleted: 0,
    apiKeysProcessed: 0,
    providersProcessed: 0,
    errors: 0
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * FIX: Validate lastUsedAt before constructing a Date.
 * new Date(undefined).toISOString() throws and crashes the entire sync loop.
 */
function safeTimestamp(value) {
    if (!value) return new Date().toISOString();
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ─────────────────────────────────────────────
// Core sync
// ─────────────────────────────────────────────

/**
 * Sync consolidated metrics (m:{apiKeyId}:{date}) to Postgres.
 *
 * FIX: Collect all rows first, then write in batch upserts.
 * Previously: N selects + N updates/inserts per key per provider (N+1).
 * Now: 4 upsert calls total per sync run regardless of key count.
 *
 * FIX: Redis keys only cleared after ALL writes succeed.
 * Previously: key cleared after api_keys write, before provider writes —
 * a failed provider write would lose that data permanently.
 */
async function syncConsolidatedMetrics() {
    const redisKeys = await getPendingMetrics();
    if (redisKeys.length === 0) return { apiKeys: 0, providers: 0 };

    // Collect all rows before touching the DB
    const apiKeyRows = new Map(); // apiKeyId → row (merge multiple keys for same ID)
    const providerRows = new Map(); // `${apiKeyId}:${provider}` → row
    const successfulKeys = [];

    for (const key of redisKeys) {
        try {
            const keyParts = parseMetricsKey(key);
            if (!keyParts) continue;

            const rawData = await getMetrics(key);
            if (!rawData) continue;

            const parsed = parseMetricsData(rawData);
            if (!parsed || parsed.totalRequests === 0) continue;

            const { apiKeyId, date } = keyParts;
            const { totalRequests, providers, lastUsedAt, userId } = parsed;

            // Guard: skip keys with no userId — api_keys.user_id is NOT NULL.
            // Can happen with stale Redis keys written before uid tracking was added,
            // or from partial test data. The key is kept in Redis to avoid silent loss;
            // it will retry every cycle but never succeed without a userId.
            if (!userId) {
                logger.warn(`[Metrics Worker] Skipping key ${key} — no userId in Redis hash (uid field missing)`);
                continue;
            }

            // FIX: validate timestamp before use
            const usedAt = safeTimestamp(lastUsedAt);

            // ── API key row (merge if same apiKeyId appears in multiple Redis keys) ──
            const existingApiRow = apiKeyRows.get(apiKeyId);
            if (existingApiRow) {
                existingApiRow.total_requests += totalRequests;
                existingApiRow.total_files_uploaded += totalRequests;
            } else {
                apiKeyRows.set(apiKeyId, {
                    id: apiKeyId,
                    total_requests: totalRequests,
                    total_files_uploaded: totalRequests,
                    last_used_at: usedAt
                });
            }

            // ── Provider rows ──
            for (const [provider, count] of Object.entries(providers || {})) {
                const pKey = `${apiKeyId}:${provider}`;
                const existingProvider = providerRows.get(pKey);
                if (existingProvider) {
                    existingProvider.upload_count += count;
                } else {
                    providerRows.set(pKey, {
                        api_key_id: apiKeyId,
                        user_id: userId,
                        provider,
                        upload_count: count,
                        last_used_at: usedAt
                    });
                }
            }

            successfulKeys.push(key);

        } catch (error) {
            logger.error(`[Metrics Worker] Error reading key ${key}:`, { message: error.message });
            lifetimeStats.errors++;
            windowStats.errors++;
            // Key stays in Redis — will retry next cycle
        }
    }

    if (successfulKeys.length === 0) return { apiKeys: 0, providers: 0 };

    let apiKeysProcessed = 0;
    let providersProcessed = 0;
    let writesFailed = false;

    // ── Update api_keys stats ──
    // IMPORTANT: Use UPDATE not UPSERT.
    // The metrics worker must never INSERT into api_keys — it only knows stats fields.
    // The api_key MUST already exist in DB for any request to have written Redis metrics
    // (auth validates the key). If somehow the key is missing, .update() silently no-ops.
    //
    const apiKeyBatch = Array.from(apiKeyRows.values());
    if (apiKeyBatch.length > 0) {
        const updateOps = apiKeyBatch.map(row =>
            supabaseAdmin
                .from('api_keys')
                .update({
                    total_requests: row.total_requests,
                    total_files_uploaded: row.total_files_uploaded,
                    last_used_at: row.last_used_at
                })
                .eq('id', row.id)
        );
        const results = await Promise.all(updateOps);
        for (const { error } of results) {
            if (error) {
                logger.error('[Metrics Worker] api_keys update error:', { message: error.message });
                lifetimeStats.errors++;
                windowStats.errors++;
                writesFailed = true;
            } else {
                apiKeysProcessed++;
            }
        }
    }

    // ── Batch upsert provider_usage ──
    // Requires unique constraint on (api_key_id, provider)
    const providerBatch = Array.from(providerRows.values());
    if (providerBatch.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < providerBatch.length; i += CHUNK) {
            const chunk = providerBatch.slice(i, i + CHUNK);
            const { error } = await supabaseAdmin
                .from('provider_usage')
                .upsert(chunk, { onConflict: 'api_key_id,provider' });

            if (error) {
                logger.error('[Metrics Worker] provider_usage upsert error:', { message: error.message });
                lifetimeStats.errors++;
                windowStats.errors++;
                writesFailed = true;
            } else {
                providersProcessed += chunk.length;
            }
        }
    }

    // Only clear Redis keys after all DB writes complete.
    // If any write failed, keep ALL keys in Redis so nothing is lost.
    // Next cycle will re-read and retry the full set.
    if (!writesFailed && successfulKeys.length > 0) {
        const redis = getRedis();
        const pipeline = redis.pipeline();
        for (const key of successfulKeys) {
            pipeline.del(key);
        }
        await pipeline.exec();
    } else if (writesFailed) {
        logger.warn(`[Metrics Worker] Skipping Redis clear due to write failures — ${successfulKeys.length} keys will retry next cycle`);
    }

    return { apiKeys: apiKeysProcessed, providers: providersProcessed };
}

// ─────────────────────────────────────────────
// Sync runner
// ─────────────────────────────────────────────

export async function startMetricsSyncWorker() {
    // FIX: Overlap guard — if previous run is still in progress, skip this tick
    if (isRunning) {
        lifetimeStats.runsSkipped++;
        logger.debug('[Metrics Worker] Previous sync still running, skipping tick');
        return;
    }

    isRunning = true;
    const startTime = Date.now();
    logger.debug(`[Metrics Worker] Starting sync...`);

    try {
        const { apiKeys, providers } = await syncConsolidatedMetrics();

        const elapsed = Date.now() - startTime;

        lifetimeStats.runsCompleted++;
        lifetimeStats.apiKeysProcessed += apiKeys;
        lifetimeStats.providersProcessed += providers;

        windowStats.runsCompleted++;
        windowStats.apiKeysProcessed += apiKeys;
        windowStats.providersProcessed += providers;

        if (apiKeys > 0 || providers > 0) {
            logger.debug(`[Metrics Worker] COMPLETED in ${elapsed}ms — API Keys: ${apiKeys}, Providers: ${providers}`);
        }

    } catch (error) {
        logger.error('[Metrics Worker] Sync failed:', { message: error.message });
        lifetimeStats.errors++;
        windowStats.errors++;
    } finally {
        isRunning = false;
    }
}

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

export function getWorkerStats() {
    return {
        lifetime: { ...lifetimeStats },
        window: { ...windowStats },
        workerId: WORKER_ID,
        uptime: process.uptime(),
        isRunning
    };
}

function resetWindowStats() {
    windowStats.runsCompleted = 0;
    windowStats.apiKeysProcessed = 0;
    windowStats.providersProcessed = 0;
    windowStats.errors = 0;
}

// ─────────────────────────────────────────────
// Global error handlers
// ─────────────────────────────────────────────

process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Metrics Worker] ECONNRESET (Redis idle reset, safe to ignore)');
        return;
    }
    logger.error(`[Metrics Worker] Uncaught exception: ${msg}`);
    process.exit(1);
});

// FIX: Now exits so PM2 can restart cleanly instead of running in a broken state
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Metrics Worker] ECONNRESET rejection (safe to ignore)');
        return;
    }
    logger.error(`[Metrics Worker] Unhandled rejection: ${msg}`);
    process.exit(1);
});

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

async function main() {
    logger.info(`[Metrics Worker] Starting worker ${WORKER_ID}`);
    logger.info(`[Metrics Worker] Sync interval: ${SYNC_INTERVAL_MS}ms`);

    // Run immediately on startup
    await startMetricsSyncWorker();

    // FIX: Overlap-safe interval — isRunning guard inside startMetricsSyncWorker
    // ensures a slow sync doesn't pile up with the next tick
    setInterval(async () => {
        await startMetricsSyncWorker();
    }, SYNC_INTERVAL_MS);

    // FIX: Log both window (recent) and lifetime stats, then reset window
    setInterval(() => {
        logger.info('[Metrics Worker] Stats (last 5 min):', windowStats);
        logger.info('[Metrics Worker] Stats (lifetime):', lifetimeStats);
        resetWindowStats();
    }, STATS_LOG_INTERVAL);
}

main().catch(error => {
    logger.error('[Metrics Worker] Startup error:', { message: error.message });
    process.exit(1);
});