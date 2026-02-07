/**
 * Metrics Sync Worker (v2 - Simplified)
 * 
 * Syncs Redis metrics to database periodically.
 * NOTE: Only tracks request counts. File size tracking removed
 * since files never hit our server.
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getPendingApiKeyMetrics, getPendingProviderMetrics, getMetrics, clearMetrics } from '../lib/metrics/redis-counters.js';

const WORKER_ID = `metrics-worker-${process.pid}`;

const stats = {
    runsCompleted: 0,
    apiKeysProcessed: 0,
    providersProcessed: 0,
    errors: 0
};

/**
 * Sync API key metrics to database (request counts only)
 */
async function syncApiKeyMetrics() {
    const redisKeys = await getPendingApiKeyMetrics();
    
    if (redisKeys.length === 0) return 0;

    let processed = 0;

    for (const key of redisKeys) {
        try {
            const metrics = await getMetrics(key);
            if (!metrics || Object.keys(metrics).length === 0) {
                await clearMetrics(key);
                continue;
            }

            const apiKeyId = metrics.api_key_id;
            if (!apiKeyId) {
                await clearMetrics(key);
                continue;
            }

            // Get current values
            const { data: current } = await supabaseAdmin
                .from('api_keys')
                .select('total_requests, total_files_uploaded')
                .eq('id', apiKeyId)
                .single();

            // Update with increments (request counts only)
            const { error } = await supabaseAdmin
                .from('api_keys')
                .update({
                    total_requests: (current?.total_requests || 0) + (metrics.total_requests || 0),
                    total_files_uploaded: (current?.total_files_uploaded || 0) + (metrics.total_files_uploaded || 0),
                    last_used_at: new Date().toISOString()
                })
                .eq('id', apiKeyId);

            if (error) {
                console.error(`[Metrics Worker] ❌ Error updating api_key ${apiKeyId}:`, error.message);
                continue;
            }

            await clearMetrics(key);
            processed++;

        } catch (error) {
            console.error(`[Metrics Worker] ❌ Error processing ${key}:`, error.message);
            stats.errors++;
        }
    }

    return processed;
}

/**
 * Sync provider metrics to database (upload counts only)
 */
async function syncProviderMetrics() {
    const redisKeys = await getPendingProviderMetrics();
    
    if (redisKeys.length === 0) return 0;

    let processed = 0;

    for (const key of redisKeys) {
        try {
            const metrics = await getMetrics(key);
            if (!metrics || Object.keys(metrics).length === 0) {
                await clearMetrics(key);
                continue;
            }

            const apiKeyId = metrics.api_key_id;
            const provider = metrics.provider;
            if (!apiKeyId || !provider) {
                await clearMetrics(key);
                continue;
            }

            // Check if record exists
            const { data: existing } = await supabaseAdmin
                .from('provider_usage')
                .select('id, upload_count')
                .eq('api_key_id', apiKeyId)
                .eq('provider', provider)
                .single();

            if (existing) {
                // Update existing (upload count only)
                const { error } = await supabaseAdmin
                    .from('provider_usage')
                    .update({
                        upload_count: (existing.upload_count || 0) + (metrics.upload_count || 0),
                        last_used_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);

                if (error) {
                    console.error(`[Metrics Worker] ❌ Error updating provider_usage:`, error.message);
                    continue;
                }
            } else {
                // Insert new (upload count only)
                const { error } = await supabaseAdmin
                    .from('provider_usage')
                    .insert({
                        api_key_id: apiKeyId,
                        user_id: metrics.user_id,
                        provider: provider,
                        upload_count: metrics.upload_count || 0,
                        last_used_at: new Date().toISOString()
                    });

                if (error) {
                    console.error(`[Metrics Worker] ❌ Error inserting provider_usage:`, error.message);
                    continue;
                }
            }

            await clearMetrics(key);
            processed++;

        } catch (error) {
            console.error(`[Metrics Worker] ❌ Error processing ${key}:`, error.message);
            stats.errors++;
        }
    }

    return processed;
}

/**
 * Run metrics sync
 */
export async function startMetricsSyncWorker() {
    const startTime = Date.now();

    console.log(`[Metrics Worker] 🚀 Starting sync...`);

    try {
        const apiKeysProcessed = await syncApiKeyMetrics();
        const providersProcessed = await syncProviderMetrics();

        const elapsed = Date.now() - startTime;
        stats.runsCompleted++;
        stats.apiKeysProcessed += apiKeysProcessed;
        stats.providersProcessed += providersProcessed;

        console.log(`[Metrics Worker] ✅ COMPLETED in ${elapsed}ms`);
        console.log(`[Metrics Worker] 📊 API Keys: ${apiKeysProcessed}, Providers: ${providersProcessed}`);

    } catch (error) {
        console.error('[Metrics Worker] ❌ Sync failed:', error.message);
        stats.errors++;
    }
}

/**
 * Get worker stats
 */
export function getWorkerStats() {
    return { ...stats };
}
