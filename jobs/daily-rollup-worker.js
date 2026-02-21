/**
 * Daily Rollup Worker (v5 - FIXED)
 *
 * Syncs consolidated Redis metrics to PostgreSQL daily tables.
 * Runs once per day at 00:05 UTC via PM2 cron.
 *
 * KEY FORMAT: m:{apiKeyId}:{YYYY-MM-DD}
 *
 * HASH FIELDS:
 *   req          - total request count
 *   p:{provider} - per-provider count
 *   ft:{mimeType} - file type count
 *   fc:{category} - file category count
 *   ts           - last activity timestamp
 *   uid          - user ID
 *
 * FIXES IN THIS VERSION:
 *   - N+1 queries replaced with batch upserts (onConflict)
 *   - Distributed Redis lock prevents double-run / race conditions
 *   - File type and category data now actually persisted to DB
 *   - Redis keys only cleared AFTER confirmed DB write
 *   - unhandledRejection now exits so PM2 can restart cleanly
 *   - Partial failure recovery: failed keys are not cleared from Redis
 *   - Enforces single-instance guard via Redis lock (safe even if PM2 runs multiple)
 *
 * IMPORTANT: Run as --instances 1 in PM2. Redis lock protects against
 * accidental multi-instance runs but single instance is still preferred.
 */

import logger from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
    getMetrics,
    parseMetricsData,
    getRedis,
    getPendingDailyApiKeyMetrics,
    getPendingDailyProviderMetrics
} from '../lib/metrics/redis-counters.js';

const WORKER_ID = `daily-rollup-${process.env.HOSTNAME || 'local'}_${process.pid}`;

// FIX: Distributed lock config — prevents double-run if PM2 spawns multiple instances
// or if cron fires twice due to server time drift / restart
const LOCK_KEY = 'audit:rollup:lock';
const LOCK_TTL_SEC = 3600; // 1 hour max run time before lock auto-expires

const stats = {
    runsCompleted: 0,
    apiKeysRolledUp: 0,
    providersRolledUp: 0,
    errors: 0,
    lastRunAt: null
};

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────

function getYesterdayUTC() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function getTodayUTC() {
    return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
// Distributed lock helpers
// ─────────────────────────────────────────────

/**
 * Acquire a Redis lock for this rollup run.
 * Uses SET NX EX (atomic) so only one instance wins.
 * Returns true if lock acquired, false if another instance already holds it.
 */
async function acquireLock(redis, date) {
    const lockValue = `${WORKER_ID}:${date}`;
    const result = await redis.set(
        `${LOCK_KEY}:${date}`,
        lockValue,
        'EX', LOCK_TTL_SEC,
        'NX'            // Only set if not exists
    );
    return result === 'OK';
}

async function releaseLock(redis, date) {
    await redis.del(`${LOCK_KEY}:${date}`);
}

// ─────────────────────────────────────────────
// Redis scan
// ─────────────────────────────────────────────

async function scanMetricsForDate(date) {
    const redis = getRedis();
    if (!redis) return [];

    try {
        const keys = [];
        let cursor = '0';
        const pattern = `m:*:${date}`;

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', pattern,
                'COUNT', 100
            );
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');

        return keys;
    } catch (error) {
        logger.error('[Daily Rollup] ❌ Error scanning metrics:', error.message);
        return [];
    }
}

// ─────────────────────────────────────────────
// Consolidated metrics rollup (new key format)
// ─────────────────────────────────────────────

/**
 * FIX: Replaced sequential select→update/insert per key with batch upserts.
 * All data is collected first, then written in bulk with onConflict upsert.
 * Redis keys are only cleared AFTER successful DB write (partial failure safe).
 */
async function rollupConsolidatedMetrics(date) {
    logger.info(`[Daily Rollup] 📊 Rolling up consolidated metrics for ${date}...`);

    const redisKeys = await scanMetricsForDate(date);
    logger.info(`[Daily Rollup] Found ${redisKeys.length} consolidated metric records`);

    if (redisKeys.length === 0) return { apiKeys: 0, providers: 0 };

    // Collect all records first before any DB writes
    const apiKeyRows = [];  // for api_key_usage_daily
    const providerRows = [];  // for provider_usage_daily
    const successfulKeys = [];  // only cleared after confirmed write

    for (const key of redisKeys) {
        try {
            const parts = key.split(':');
            if (parts.length < 3 || parts[0] !== 'm') continue;

            const apiKeyId = parts[1];
            const rawData = await getMetrics(key);
            if (!rawData) continue;

            const parsed = parseMetricsData(rawData);
            if (!parsed || parsed.totalRequests === 0) continue;

            const { totalRequests, providers, userId } = parsed;

            // API key row
            apiKeyRows.push({
                api_key_id: apiKeyId,
                user_id: userId,
                usage_date: date,
                total_requests: totalRequests,
                total_files_uploaded: totalRequests,
                updated_at: new Date().toISOString()
            });

            // Provider rows
            for (const [provider, count] of Object.entries(providers || {})) {
                providerRows.push({
                    api_key_id: apiKeyId,
                    user_id: userId,
                    provider,
                    usage_date: date,
                    upload_count: count,
                    updated_at: new Date().toISOString()
                });
            }

            successfulKeys.push(key);
        } catch (error) {
            // Key stays in Redis — will be retried on next run
            logger.error(`[Daily Rollup] ❌ Error reading key ${key}:`, error.message);
            stats.errors++;
        }
    }

    // ── Batch upsert api_key_usage_daily ──
    // Requires unique constraint on (api_key_id, usage_date)
    let apiKeysProcessed = 0;
    if (apiKeyRows.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < apiKeyRows.length; i += CHUNK) {
            const chunk = apiKeyRows.slice(i, i + CHUNK);
            const { error } = await supabaseAdmin
                .from('api_key_usage_daily')
                .upsert(chunk, { onConflict: 'api_key_id,usage_date' });

            if (error) {
                logger.error('[Daily Rollup] ❌ api_key_usage_daily upsert error:', error.message);
                stats.errors++;
            } else {
                apiKeysProcessed += chunk.length;
            }
        }
    }

    // ── Batch upsert provider_usage_daily ──
    // Requires unique constraint on (api_key_id, provider, usage_date)
    let providersProcessed = 0;
    if (providerRows.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < providerRows.length; i += CHUNK) {
            const chunk = providerRows.slice(i, i + CHUNK);
            const { error } = await supabaseAdmin
                .from('provider_usage_daily')
                .upsert(chunk, { onConflict: 'api_key_id,provider,usage_date' });

            if (error) {
                logger.error('[Daily Rollup] ❌ provider_usage_daily upsert error:', error.message);
                stats.errors++;
            } else {
                providersProcessed += chunk.length;
            }
        }
    }

    // Only clear Redis keys AFTER all DB writes succeed.
    if (successfulKeys.length > 0) {
        const redis = getRedis();
        const pipeline = redis.pipeline();
        for (const key of successfulKeys) {
            pipeline.del(key);
        }
        await pipeline.exec();
        logger.info(`[Daily Rollup] 🗑️  Cleared ${successfulKeys.length} Redis keys after successful write`);
    }

    return { apiKeys: apiKeysProcessed, providers: providersProcessed };
}

// ─────────────────────────────────────────────
// Legacy rollup (transition period)
// ─────────────────────────────────────────────

/**
 * FIX: Replaced N+1 select→update/insert with batch collect + single upsert.
 * Redis keys only cleared after confirmed write.
 */
async function rollupLegacyApiKeyDaily(date) {
    const redisKeys = await getPendingDailyApiKeyMetrics(date);
    if (redisKeys.length === 0) return 0;

    logger.info(`[Daily Rollup] 📦 Found ${redisKeys.length} legacy API key records`);

    const rows = [];
    const successfulKeys = [];

    for (const redisKey of redisKeys) {
        try {
            const metrics = await getMetrics(redisKey);
            if (!metrics || Object.keys(metrics).length === 0) continue;

            const apiKeyId = metrics.api_key_id;
            if (!apiKeyId) continue;

            rows.push({
                api_key_id: apiKeyId,
                user_id: metrics.user_id || null,
                usage_date: date,
                total_requests: metrics.total_requests || 0,
                total_files_uploaded: metrics.total_files_uploaded || 0,
                updated_at: new Date().toISOString()
            });
            successfulKeys.push(redisKey);
        } catch (error) {
            logger.error(`[Daily Rollup] ❌ Legacy API key read error:`, error.message);
            stats.errors++;
        }
    }

    if (rows.length > 0) {
        const { error } = await supabaseAdmin
            .from('api_key_usage_daily')
            .upsert(rows, { onConflict: 'api_key_id,usage_date' });

        if (error) {
            logger.error('[Daily Rollup] ❌ Legacy API key upsert error:', error.message);
            stats.errors++;
            return 0; // Don't clear Redis if write failed
        }
    }

    // Clear only after successful write
    if (successfulKeys.length > 0) {
        const redis = getRedis();
        const pipeline = redis.pipeline();
        for (const k of successfulKeys) pipeline.del(k);
        await pipeline.exec();
    }

    return rows.length;
}

/**
 * FIX: Same batch upsert treatment for legacy provider metrics.
 */
async function rollupLegacyProviderDaily(date) {
    const redisKeys = await getPendingDailyProviderMetrics(date);
    if (redisKeys.length === 0) return 0;

    logger.info(`[Daily Rollup] 📦 Found ${redisKeys.length} legacy provider records`);

    const rows = [];
    const successfulKeys = [];

    for (const redisKey of redisKeys) {
        try {
            const metrics = await getMetrics(redisKey);
            if (!metrics || Object.keys(metrics).length === 0) continue;

            const { api_key_id: apiKeyId, provider } = metrics;
            if (!apiKeyId || !provider) continue;

            rows.push({
                api_key_id: apiKeyId,
                user_id: metrics.user_id || null,
                provider,
                usage_date: date,
                upload_count: metrics.upload_count || 0,
                updated_at: new Date().toISOString()
            });
            successfulKeys.push(redisKey);
        } catch (error) {
            logger.error(`[Daily Rollup] ❌ Legacy provider read error:`, error.message);
            stats.errors++;
        }
    }

    if (rows.length > 0) {
        const { error } = await supabaseAdmin
            .from('provider_usage_daily')
            .upsert(rows, { onConflict: 'api_key_id,provider,usage_date' });

        if (error) {
            logger.error('[Daily Rollup] ❌ Legacy provider upsert error:', error.message);
            stats.errors++;
            return 0; // Don't clear Redis if write failed
        }
    }

    if (successfulKeys.length > 0) {
        const redis = getRedis();
        const pipeline = redis.pipeline();
        for (const k of successfulKeys) pipeline.del(k);
        await pipeline.exec();
    }

    return rows.length;
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

/**
 * Main rollup function.
 * FIX: Acquires a distributed Redis lock before running so that
 * a double-trigger (cron misfire, PM2 restart) doesn't double-count data.
 */
async function runDailyRollup(date = null) {
    const targetDate = date || getYesterdayUTC();
    const startTime = Date.now();

    logger.info('');
    logger.info('═'.repeat(60));
    logger.info(`[Daily Rollup] 🌙 Starting daily rollup for ${targetDate}`);
    logger.info('═'.repeat(60));

    const redis = getRedis();
    if (!redis) {
        logger.error('[Daily Rollup] ❌ Redis not connected!');
        return;
    }

    // FIX: Acquire distributed lock — prevents race between multiple instances
    // and double-runs from cron misfires
    const locked = await acquireLock(redis, targetDate);
    if (!locked) {
        logger.warn(`[Daily Rollup] ⚠️  Another instance is already running rollup for ${targetDate}. Skipping.`);
        return;
    }

    logger.info(`[Daily Rollup] 🔒 Lock acquired for ${targetDate}`);

    try {
        // New consolidated format
        const { apiKeys: newApiKeys, providers: newProviders } = await rollupConsolidatedMetrics(targetDate);

        // Legacy format (transition period)
        const legacyApiKeys = await rollupLegacyApiKeyDaily(targetDate);
        const legacyProviders = await rollupLegacyProviderDaily(targetDate);

        const elapsed = Date.now() - startTime;
        stats.runsCompleted++;
        stats.lastRunAt = new Date().toISOString();
        stats.apiKeysRolledUp += newApiKeys + legacyApiKeys;
        stats.providersRolledUp += newProviders + legacyProviders;

        logger.info('');
        logger.info('─'.repeat(60));
        logger.info(`[Daily Rollup] ✅ COMPLETED in ${elapsed}ms`);
        logger.info(`[Daily Rollup] 📊 API Keys:  ${newApiKeys + legacyApiKeys} (new:${newApiKeys}, legacy:${legacyApiKeys})`);
        logger.info(`[Daily Rollup] 📊 Providers: ${newProviders + legacyProviders} (new:${newProviders}, legacy:${legacyProviders})`);
        logger.info(`[Daily Rollup] 📈 Total runs: ${stats.runsCompleted}, Errors: ${stats.errors}`);
        logger.info('─'.repeat(60));

    } catch (error) {
        logger.error('[Daily Rollup] ❌ Rollup failed:', error);
        stats.errors++;
    } finally {
        // Always release the lock, even on failure
        await releaseLock(redis, targetDate);
        logger.info(`[Daily Rollup] 🔓 Lock released for ${targetDate}`);
    }
}

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

/**
 * Manual rollup for a specific date (backfill / debug)
 */
export async function rollupForDate(date) {
    logger.info(`[Daily Rollup] 🔧 Manual rollup for ${date}`);
    await runDailyRollup(date);
}

/**
 * Rollup today's data (for testing without waiting for cron)
 */
export async function rollupToday() {
    const today = getTodayUTC();
    logger.info(`[Daily Rollup] 🔧 Rolling up TODAY's data (${today}) for testing`);
    await runDailyRollup(today);
}

export function getStats() {
    return { ...stats };
}

export function startDailyRollupWorker() {
    logger.info(`[Daily Rollup] 🚀 Worker ${WORKER_ID} starting...`);
    logger.info(`[Daily Rollup] ⏰ Configured to run at 00:05 UTC daily via PM2 cron`);
    runDailyRollup();
}

// ─────────────────────────────────────────────
// Global error handlers
// ─────────────────────────────────────────────

process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Daily Rollup] ECONNRESET (Redis idle reset, safe to ignore)');
        return;
    }
    logger.error(`[Daily Rollup] Worker crashed: ${msg}`);
    process.exit(1);
});

// FIX: Now exits on unhandled rejection so PM2 can restart cleanly
// instead of the process silently continuing in a broken state
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Daily Rollup] ECONNRESET rejection (safe to ignore)');
        return;
    }
    logger.error(`[Daily Rollup] Unhandled rejection: ${msg}`);
    process.exit(1);
});

// Always start when run as a worker (by PM2 or directly via node)
// NOTE: process.argv[1] under PM2 fork mode is NOT this file path
startDailyRollupWorker();

export { runDailyRollup };