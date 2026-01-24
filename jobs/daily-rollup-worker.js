/**
 * Daily Rollup Worker
 * 
 * Syncs daily Redis metrics to PostgreSQL daily tables
 * Runs once per day at 00:05 UTC via PM2 cron
 * 
 * Redis Keys:
 *   - daily:{date}:apikey:{apiKeyId} → api_key_usage_daily
 *   - daily:{date}:provider:{apiKeyId}:{provider} → provider_usage_daily
 */

import { supabaseAdmin } from '../database/supabase.js';
import {
    getPendingDailyApiKeyMetrics,
    getPendingDailyProviderMetrics,
    getMetrics,
    clearMetrics,
    getRedis
} from '../lib/metrics/redis-counters.js';

const WORKER_ID = `daily-rollup-${process.pid}`;

// Worker stats
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
 * Rollup API key daily metrics to database
 */
async function rollupApiKeyDaily(date) {
    console.log(`[Daily Rollup] 📊 Rolling up API key metrics for ${date}...`);

    try {
        const redisKeys = await getPendingDailyApiKeyMetrics(date);
        console.log(`[Daily Rollup] Found ${redisKeys.length} API key daily records`);

        if (redisKeys.length === 0) return 0;

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

                // Check if record exists
                const { data: existing } = await supabaseAdmin
                    .from('api_key_usage_daily')
                    .select('id, total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded')
                    .eq('api_key_id', apiKeyId)
                    .eq('usage_date', date)
                    .single();

                if (existing) {
                    // Update existing record
                    const { error } = await supabaseAdmin
                        .from('api_key_usage_daily')
                        .update({
                            total_requests: (existing.total_requests || 0) + (metrics.total_requests || 0),
                            successful_requests: (existing.successful_requests || 0) + (metrics.successful_requests || 0),
                            failed_requests: (existing.failed_requests || 0) + (metrics.failed_requests || 0),
                            total_file_size: (existing.total_file_size || 0) + (metrics.total_file_size || 0),
                            total_files_uploaded: (existing.total_files_uploaded || 0) + (metrics.total_files_uploaded || 0),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);

                    if (error) {
                        console.error(`[Daily Rollup] ❌ API key update error:`, error.message);
                        continue;
                    }
                } else {
                    // Insert new record
                    const { error } = await supabaseAdmin
                        .from('api_key_usage_daily')
                        .insert({
                            api_key_id: apiKeyId,
                            user_id: userId,
                            usage_date: date,
                            total_requests: metrics.total_requests || 0,
                            successful_requests: metrics.successful_requests || 0,
                            failed_requests: metrics.failed_requests || 0,
                            total_file_size: metrics.total_file_size || 0,
                            total_files_uploaded: metrics.total_files_uploaded || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });

                    if (error) {
                        console.error(`[Daily Rollup] ❌ API key insert error:`, error.message);
                        continue;
                    }
                }

                // Clear from Redis after successful sync
                await clearMetrics(redisKey);
                successCount++;

            } catch (error) {
                console.error(`[Daily Rollup] ❌ Error processing ${redisKey}:`, error.message);
                stats.errors++;
            }
        }

        stats.apiKeysRolledUp += successCount;
        console.log(`[Daily Rollup] ✅ Rolled up ${successCount}/${redisKeys.length} API key records`);
        return successCount;

    } catch (error) {
        console.error('[Daily Rollup] ❌ API key rollup failed:', error.message);
        stats.errors++;
        return 0;
    }
}

/**
 * Rollup provider daily metrics to database
 */
async function rollupProviderDaily(date) {
    console.log(`[Daily Rollup] 📊 Rolling up provider metrics for ${date}...`);

    try {
        const redisKeys = await getPendingDailyProviderMetrics(date);
        console.log(`[Daily Rollup] Found ${redisKeys.length} provider daily records`);

        if (redisKeys.length === 0) return 0;

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

                // Check if record exists
                const { data: existing } = await supabaseAdmin
                    .from('provider_usage_daily')
                    .select('id, upload_count, total_file_size')
                    .eq('api_key_id', apiKeyId)
                    .eq('provider', provider)
                    .eq('usage_date', date)
                    .single();

                if (existing) {
                    // Update existing record
                    const { error } = await supabaseAdmin
                        .from('provider_usage_daily')
                        .update({
                            upload_count: (existing.upload_count || 0) + (metrics.upload_count || 0),
                            total_file_size: (existing.total_file_size || 0) + (metrics.total_file_size || 0),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);

                    if (error) {
                        console.error(`[Daily Rollup] ❌ Provider update error:`, error.message);
                        continue;
                    }
                } else {
                    // Insert new record
                    const { error } = await supabaseAdmin
                        .from('provider_usage_daily')
                        .insert({
                            api_key_id: apiKeyId,
                            user_id: userId,
                            provider: provider,
                            usage_date: date,
                            upload_count: metrics.upload_count || 0,
                            total_file_size: metrics.total_file_size || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });

                    if (error) {
                        console.error(`[Daily Rollup] ❌ Provider insert error:`, error.message);
                        continue;
                    }
                }

                // Clear from Redis after successful sync
                await clearMetrics(redisKey);
                successCount++;

            } catch (error) {
                console.error(`[Daily Rollup] ❌ Error processing ${redisKey}:`, error.message);
                stats.errors++;
            }
        }

        stats.providersRolledUp += successCount;
        console.log(`[Daily Rollup] ✅ Rolled up ${successCount}/${redisKeys.length} provider records`);
        return successCount;

    } catch (error) {
        console.error('[Daily Rollup] ❌ Provider rollup failed:', error.message);
        stats.errors++;
        return 0;
    }
}

/**
 * Main rollup function - processes yesterday's data
 */
async function runDailyRollup() {
    const date = getYesterdayUTC();
    const startTime = Date.now();

    console.log('');
    console.log('═'.repeat(60));
    console.log(`[Daily Rollup] 🌙 Starting daily rollup for ${date}`);
    console.log('═'.repeat(60));

    try {
        // Check Redis connection
        const redis = getRedis();
        if (!redis) {
            console.error('[Daily Rollup] ❌ Redis not connected!');
            return;
        }

        // Rollup both types
        const apiKeyCount = await rollupApiKeyDaily(date);
        const providerCount = await rollupProviderDaily(date);

        const elapsed = Date.now() - startTime;
        stats.runsCompleted++;
        stats.lastRunAt = new Date().toISOString();

        console.log('');
        console.log('─'.repeat(60));
        console.log(`[Daily Rollup] ✅ COMPLETED in ${elapsed}ms`);
        console.log(`[Daily Rollup] 📊 API Keys: ${apiKeyCount}, Providers: ${providerCount}`);
        console.log(`[Daily Rollup] 📈 Total runs: ${stats.runsCompleted}, Errors: ${stats.errors}`);
        console.log('─'.repeat(60));

    } catch (error) {
        console.error('[Daily Rollup] ❌ Rollup failed:', error);
        stats.errors++;
    }
}

/**
 * Manual rollup for a specific date (for backfilling or testing)
 */
export async function rollupForDate(date) {
    console.log(`[Daily Rollup] 🔧 Manual rollup for ${date}`);
    await rollupApiKeyDaily(date);
    await rollupProviderDaily(date);
}

/**
 * Rollup today's data (for testing/debugging)
 */
export async function rollupToday() {
    const today = getTodayUTC();
    console.log(`[Daily Rollup] 🔧 Rolling up TODAY's data (${today}) for testing`);
    await rollupApiKeyDaily(today);
    await rollupProviderDaily(today);
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
    console.log(`[Daily Rollup] 🚀 Worker ${WORKER_ID} starting...`);
    console.log(`[Daily Rollup] ⏰ Configured to run at 00:05 UTC daily via PM2 cron`);

    // Run immediately (catch up on any missed rollups)
    runDailyRollup();
}

// Run if executed directly
if (process.argv[1]?.includes('daily-rollup-worker')) {
    startDailyRollupWorker();
}

export { runDailyRollup };
