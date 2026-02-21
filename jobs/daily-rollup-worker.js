/**
 * Daily Rollup Worker (v4 - WITH FILE TYPE TRACKING)
 * 
 * Syncs consolidated Redis metrics to PostgreSQL daily tables.
 * Runs once per day at 00:05 UTC via PM2 cron.
 * 
 * NEW KEY FORMAT: m:{apiKeyId}:{YYYY-MM-DD}
 * Replaces old daily:{date}:apikey:* and daily:{date}:provider:* keys.
 * 
 * Since the new format already embeds the date in the key,
 * daily rollup simply scans for m:*:{yesterday} keys.
 * 
 * HASH FIELDS:
 *   req          - total request count
 *   p:{provider} - per-provider count
 *   ft:{mimeType} - file type count
 *   fc:{category} - file category count
 *   ts           - last activity timestamp
 *   uid          - user ID
 */

import logger from '../utils/logger.js';
import { supabaseAdmin } from '../database/supabase.js';
import {
    getMetrics,
    clearMetrics,
    parseMetricsData,
    getRedis
} from '../lib/metrics/redis-counters.js';

// Legacy imports for transition period
import {
    getPendingDailyApiKeyMetrics,
    getPendingDailyProviderMetrics
} from '../lib/metrics/redis-counters.js';

const WORKER_ID = `daily-rollup-${process.pid}`;

const stats = {
    runsCompleted: 0,
    apiKeysRolledUp: 0,
    providersRolledUp: 0,
    errors: 0,
    lastRunAt: null
};

/**
 * Get yesterday's date in YYYY-MM-DD format (UTC)
 */
function getYesterdayUTC() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayUTC() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Scan for consolidated metrics keys for a specific date
 * Pattern: m:*:{date}
 */
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

/**
 * Rollup consolidated metrics for a specific date
 * Reads m:{apiKeyId}:{date} keys and syncs to daily tables
 */
async function rollupConsolidatedMetrics(date) {
    logger.info(`[Daily Rollup] 📊 Rolling up consolidated metrics for ${date}...`);

    const redisKeys = await scanMetricsForDate(date);
    logger.info(`[Daily Rollup] Found ${redisKeys.length} consolidated metric records`);

    if (redisKeys.length === 0) return { apiKeys: 0, providers: 0 };

    let apiKeysProcessed = 0;
    let providersProcessed = 0;

    for (const key of redisKeys) {
        try {
            // Parse key: m:{apiKeyId}:{date}
            const parts = key.split(':');
            if (parts.length < 3 || parts[0] !== 'm') {
                await clearMetrics(key);
                continue;
            }

            const apiKeyId = parts[1];
            const rawData = await getMetrics(key);
            if (!rawData) {
                await clearMetrics(key);
                continue;
            }

            const parsed = parseMetricsData(rawData);
            if (!parsed || parsed.totalRequests === 0) {
                await clearMetrics(key);
                continue;
            }

            const { totalRequests, providers, fileTypes, fileCategories, userId } = parsed;

            // ─── 1. Upsert api_key_usage_daily ───
            const { data: existingApiKey } = await supabaseAdmin
                .from('api_key_usage_daily')
                .select('id, total_requests, total_files_uploaded')
                .eq('api_key_id', apiKeyId)
                .eq('usage_date', date)
                .single();

            if (existingApiKey) {

                const { error } = await supabaseAdmin
                    .from('api_key_usage_daily')
                    .update({
                        total_requests: (existingApiKey.total_requests || 0) + totalRequests,
                        total_files_uploaded: (existingApiKey.total_files_uploaded || 0) + totalRequests,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingApiKey.id);

                if (error) {
                    logger.error(`[Daily Rollup] ❌ API key update error:`, error.message);
                    continue;
                }
            } else {
                const { error } = await supabaseAdmin
                    .from('api_key_usage_daily')
                    .insert({
                        api_key_id: apiKeyId,
                        user_id: userId,
                        usage_date: date,
                        total_requests: totalRequests,
                        total_files_uploaded: totalRequests,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                if (error) {
                    logger.error(`[Daily Rollup] ❌ API key insert error:`, error.message);
                    continue;
                }
            }
            apiKeysProcessed++;

            // ─── 2. Upsert provider_usage_daily (per provider) ───
            for (const [provider, count] of Object.entries(providers)) {
                const { data: existingProvider } = await supabaseAdmin
                    .from('provider_usage_daily')
                    .select('id, upload_count')
                    .eq('api_key_id', apiKeyId)
                    .eq('provider', provider)
                    .eq('usage_date', date)
                    .single();

                if (existingProvider) {
                    const { error } = await supabaseAdmin
                        .from('provider_usage_daily')
                        .update({
                            upload_count: (existingProvider.upload_count || 0) + count,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingProvider.id);

                    if (error) {
                        logger.error(`[Daily Rollup] ❌ Provider update error:`, error.message);
                        continue;
                    }
                } else {
                    const { error } = await supabaseAdmin
                        .from('provider_usage_daily')
                        .insert({
                            api_key_id: apiKeyId,
                            user_id: userId,
                            provider,
                            usage_date: date,
                            upload_count: count,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });

                    if (error) {
                        logger.error(`[Daily Rollup] ❌ Provider insert error:`, error.message);
                        continue;
                    }
                }
                providersProcessed++;
            }

            // Clear from Redis after successful sync
            await clearMetrics(key);

        } catch (error) {
            logger.error(`[Daily Rollup] ❌ Error processing ${key}:`, error.message);
            stats.errors++;
        }
    }

    return { apiKeys: apiKeysProcessed, providers: providersProcessed };
}

/**
 * Rollup LEGACY API key daily metrics (transition period)
 */
async function rollupLegacyApiKeyDaily(date) {
    const redisKeys = await getPendingDailyApiKeyMetrics(date);
    if (redisKeys.length === 0) return 0;

    logger.info(`[Daily Rollup] 📦 Found ${redisKeys.length} legacy API key records`);
    let successCount = 0;

    for (const redisKey of redisKeys) {
        try {
            const metrics = await getMetrics(redisKey);
            if (!metrics || Object.keys(metrics).length === 0) {
                await clearMetrics(redisKey);
                continue;
            }

            const apiKeyId = metrics.api_key_id;
            const userId = metrics.user_id || null;
            if (!apiKeyId) {
                await clearMetrics(redisKey);
                continue;
            }

            const { data: existing } = await supabaseAdmin
                .from('api_key_usage_daily')
                .select('id, total_requests, total_files_uploaded')
                .eq('api_key_id', apiKeyId)
                .eq('usage_date', date)
                .single();

            if (existing) {
                await supabaseAdmin
                    .from('api_key_usage_daily')
                    .update({
                        total_requests: (existing.total_requests || 0) + (metrics.total_requests || 0),
                        total_files_uploaded: (existing.total_files_uploaded || 0) + (metrics.total_files_uploaded || 0),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
            } else {
                await supabaseAdmin
                    .from('api_key_usage_daily')
                    .insert({
                        api_key_id: apiKeyId,
                        user_id: userId,
                        usage_date: date,
                        total_requests: metrics.total_requests || 0,
                        total_files_uploaded: metrics.total_files_uploaded || 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
            }

            await clearMetrics(redisKey);
            successCount++;
        } catch (error) {
            logger.error(`[Daily Rollup] ❌ Legacy API key error:`, error.message);
            stats.errors++;
        }
    }
    return successCount;
}

/**
 * Rollup LEGACY provider daily metrics (transition period)
 */
async function rollupLegacyProviderDaily(date) {
    const redisKeys = await getPendingDailyProviderMetrics(date);
    if (redisKeys.length === 0) return 0;

    logger.info(`[Daily Rollup] 📦 Found ${redisKeys.length} legacy provider records`);
    let successCount = 0;

    for (const redisKey of redisKeys) {
        try {
            const metrics = await getMetrics(redisKey);
            if (!metrics || Object.keys(metrics).length === 0) {
                await clearMetrics(redisKey);
                continue;
            }

            const apiKeyId = metrics.api_key_id;
            const userId = metrics.user_id || null;
            const provider = metrics.provider;
            if (!apiKeyId || !provider) {
                await clearMetrics(redisKey);
                continue;
            }

            const { data: existing } = await supabaseAdmin
                .from('provider_usage_daily')
                .select('id, upload_count')
                .eq('api_key_id', apiKeyId)
                .eq('provider', provider)
                .eq('usage_date', date)
                .single();

            if (existing) {
                await supabaseAdmin
                    .from('provider_usage_daily')
                    .update({
                        upload_count: (existing.upload_count || 0) + (metrics.upload_count || 0),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
            } else {
                await supabaseAdmin
                    .from('provider_usage_daily')
                    .insert({
                        api_key_id: apiKeyId,
                        user_id: userId,
                        provider,
                        usage_date: date,
                        upload_count: metrics.upload_count || 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
            }

            await clearMetrics(redisKey);
            successCount++;
        } catch (error) {
            logger.error(`[Daily Rollup] ❌ Legacy provider error:`, error.message);
            stats.errors++;
        }
    }
    return successCount;
}

/**
 * Main rollup function - processes yesterday's data (new + legacy)
 */
async function runDailyRollup() {
    const date = getYesterdayUTC();
    const startTime = Date.now();

    logger.info('');
    logger.info('═'.repeat(60));
    logger.info(`[Daily Rollup] 🌙 Starting daily rollup for ${date}`);
    logger.info('═'.repeat(60));

    try {
        const redis = getRedis();
        if (!redis) {
            logger.error('[Daily Rollup] ❌ Redis not connected!');
            return;
        }

        // New consolidated format
        const { apiKeys: newApiKeys, providers: newProviders } = await rollupConsolidatedMetrics(date);

        // Legacy format (transition period)
        const legacyApiKeys = await rollupLegacyApiKeyDaily(date);
        const legacyProviders = await rollupLegacyProviderDaily(date);

        const elapsed = Date.now() - startTime;
        stats.runsCompleted++;
        stats.lastRunAt = new Date().toISOString();
        stats.apiKeysRolledUp += newApiKeys + legacyApiKeys;
        stats.providersRolledUp += newProviders + legacyProviders;

        logger.info('');
        logger.info('─'.repeat(60));
        logger.info(`[Daily Rollup] ✅ COMPLETED in ${elapsed}ms`);
        logger.info(`[Daily Rollup] 📊 API Keys: ${newApiKeys + legacyApiKeys} (new:${newApiKeys}, legacy:${legacyApiKeys})`);
        logger.info(`[Daily Rollup] 📊 Providers: ${newProviders + legacyProviders} (new:${newProviders}, legacy:${legacyProviders})`);
        logger.info(`[Daily Rollup] 📈 Total runs: ${stats.runsCompleted}, Errors: ${stats.errors}`);
        logger.info('─'.repeat(60));

    } catch (error) {
        logger.error('[Daily Rollup] ❌ Rollup failed:', error);
        stats.errors++;
    }
}

/**
 * Manual rollup for a specific date
 */
export async function rollupForDate(date) {
    logger.info(`[Daily Rollup] 🔧 Manual rollup for ${date}`);
    await rollupConsolidatedMetrics(date);
    await rollupLegacyApiKeyDaily(date);
    await rollupLegacyProviderDaily(date);
}

/**
 * Rollup today's data (for testing)
 */
export async function rollupToday() {
    const today = getTodayUTC();
    logger.info(`[Daily Rollup] 🔧 Rolling up TODAY's data (${today}) for testing`);
    await rollupConsolidatedMetrics(today);
    await rollupLegacyApiKeyDaily(today);
    await rollupLegacyProviderDaily(today);
}

/**
 * Get worker stats
 */
export function getStats() {
    return { ...stats };
}

/**
 * Start the daily rollup worker
 */
export function startDailyRollupWorker() {
    logger.info(`[Daily Rollup] 🚀 Worker ${WORKER_ID} starting...`);
    logger.info(`[Daily Rollup] ⏰ Configured to run at 00:05 UTC daily via PM2 cron`);
    runDailyRollup();
}

// Global error handlers - don't crash on ECONNRESET (Redis idle reset)
process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Daily Rollup] ECONNRESET (Redis idle reset, safe to ignore)');
        return;
    }
    logger.error(`[Daily Rollup] Worker crashed: ${msg}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Daily Rollup] ECONNRESET rejection (safe to ignore)');
        return;
    }
    logger.error(`[Daily Rollup] Unhandled rejection: ${msg}`);
});

// Always start when run as a worker (by PM2 or directly via node)
// NOTE: process.argv[1] under PM2 fork mode is NOT this file path
startDailyRollupWorker();

export { runDailyRollup };
