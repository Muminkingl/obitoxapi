/**
 * Metrics Sync Worker
 * 
 * Background worker that syncs Redis metrics to database
 * - Runs every 5 seconds
 * - Batch updates for efficiency
 * - Atomic increments (no race conditions)
 * 
 * Based on audit-worker.js pattern
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
    getPendingApiKeyMetrics,
    getPendingProviderMetrics,
    getMetrics,
    clearMetrics
} from '../lib/metrics/redis-counters.js';

const WORKER_ID = `metrics_${process.pid}`;
const SYNC_INTERVAL_MS = 5000; // 5 seconds

// Metrics tracking
const workerMetrics = {
    syncsCompleted: 0,
    apiKeysSynced: 0,
    providersSynced: 0,
    errors: 0,
    lastSyncDuration: 0
};

/**
 * Sync all pending metrics to database
 */
async function syncAllMetrics() {
    const startTime = Date.now();
    const redis = getRedis();

    if (!redis) {
        console.warn('[Metrics Worker] ⚠️ Redis not available, skipping sync');
        return;
    }

    try {
        // Get pending keys
        const [apiKeyMetrics, providerMetrics] = await Promise.all([
            getPendingApiKeyMetrics(),
            getPendingProviderMetrics()
        ]);

        const totalPending = apiKeyMetrics.length + providerMetrics.length;

        if (totalPending === 0) {
            // No pending updates - silent return
            return;
        }

        console.log(`[Metrics Worker] 📊 Syncing ${apiKeyMetrics.length} API keys, ${providerMetrics.length} providers`);

        // Sync API key metrics
        if (apiKeyMetrics.length > 0) {
            await syncApiKeyMetrics(apiKeyMetrics);
        }

        // Sync provider metrics
        if (providerMetrics.length > 0) {
            await syncProviderMetrics(providerMetrics);
        }

        workerMetrics.syncsCompleted++;
        workerMetrics.lastSyncDuration = Date.now() - startTime;

        console.log(`[Metrics Worker] ✅ Sync completed in ${workerMetrics.lastSyncDuration}ms`);

    } catch (error) {
        workerMetrics.errors++;
        console.error('[Metrics Worker] ❌ Sync error:', error.message);
    }
}

/**
 * Sync API key metrics to database
 * Uses atomic increment to avoid race conditions
 */
async function syncApiKeyMetrics(redisKeys) {
    for (const key of redisKeys) {
        try {
            // Extract API key ID: "metrics:apikey:uuid" -> "uuid"
            const apiKeyId = key.split(':')[2];
            if (!apiKeyId) continue;

            // Get metrics from Redis
            const metrics = await getMetrics(key);
            if (!metrics) continue;

            // Skip if no actual increments
            const hasIncrements = metrics.total_requests ||
                metrics.successful_requests ||
                metrics.failed_requests ||
                metrics.total_file_size ||
                metrics.total_files_uploaded;

            if (!hasIncrements) {
                await clearMetrics(key);
                continue;
            }

            // Use RPC for atomic increment (or raw SQL)
            const { error } = await supabaseAdmin.rpc('increment_api_key_metrics', {
                p_api_key_id: apiKeyId,
                p_total_requests: metrics.total_requests || 0,
                p_successful_requests: metrics.successful_requests || 0,
                p_failed_requests: metrics.failed_requests || 0,
                p_total_file_size: metrics.total_file_size || 0,
                p_total_files_uploaded: metrics.total_files_uploaded || 0
            });

            if (error) {
                // Fallback to direct update if RPC doesn't exist
                if (error.code === 'PGRST202' || error.message?.includes('function')) {
                    await syncApiKeyDirect(apiKeyId, metrics);
                } else {
                    console.error(`[Metrics Worker] ❌ Error syncing API key ${apiKeyId}:`, error.message);
                    continue;
                }
            }

            // Clear from Redis after successful sync
            await clearMetrics(key);
            workerMetrics.apiKeysSynced++;

        } catch (error) {
            console.error('[Metrics Worker] ❌ API key sync error:', error.message);
        }
    }
}

/**
 * Direct update fallback (if RPC not available)
 */
async function syncApiKeyDirect(apiKeyId, metrics) {
    // First get current values
    const { data: current, error: fetchError } = await supabaseAdmin
        .from('api_keys')
        .select('total_requests, successful_requests, failed_requests, total_file_size, total_files_uploaded')
        .eq('id', apiKeyId)
        .single();

    if (fetchError) {
        console.error(`[Metrics Worker] ❌ Fetch error for ${apiKeyId}:`, fetchError.message);
        return;
    }

    // Increment values
    const { error: updateError } = await supabaseAdmin
        .from('api_keys')
        .update({
            total_requests: (current?.total_requests || 0) + (metrics.total_requests || 0),
            successful_requests: (current?.successful_requests || 0) + (metrics.successful_requests || 0),
            failed_requests: (current?.failed_requests || 0) + (metrics.failed_requests || 0),
            total_file_size: (current?.total_file_size || 0) + (metrics.total_file_size || 0),
            total_files_uploaded: (current?.total_files_uploaded || 0) + (metrics.total_files_uploaded || 0),
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', apiKeyId);

    if (updateError) {
        console.error(`[Metrics Worker] ❌ Update error for ${apiKeyId}:`, updateError.message);
    }
}

/**
 * Sync provider usage metrics to database
 */
async function syncProviderMetrics(redisKeys) {
    for (const key of redisKeys) {
        try {
            // Get metrics from Redis
            const metrics = await getMetrics(key);
            if (!metrics) continue;

            const apiKeyId = metrics.api_key_id;
            const userId = metrics.user_id;
            const provider = metrics.provider;

            if (!apiKeyId || !provider) {
                await clearMetrics(key);
                continue;
            }

            // Skip if no actual increments
            if (!metrics.upload_count && !metrics.total_file_size) {
                await clearMetrics(key);
                continue;
            }

            // Check if record exists
            const { data: existing } = await supabaseAdmin
                .from('provider_usage')
                .select('id, upload_count, total_file_size')
                .eq('api_key_id', apiKeyId)
                .eq('provider', provider)
                .single();

            if (existing) {
                // Update existing record
                const newUploadCount = (existing.upload_count || 0) + (metrics.upload_count || 0);
                const newTotalSize = (existing.total_file_size || 0) + (metrics.total_file_size || 0);
                const avgFileSize = newUploadCount > 0 ? Math.round(newTotalSize / newUploadCount) : 0;

                const { error } = await supabaseAdmin
                    .from('provider_usage')
                    .update({
                        upload_count: newUploadCount,
                        total_file_size: newTotalSize,
                        average_file_size: avgFileSize, // ✅ FIX: Calculate average
                        last_used_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);

                if (error) {
                    console.error(`[Metrics Worker] ❌ Provider update error:`, error.message);
                    continue;
                }
            } else {
                // Insert new record
                const uploadCount = metrics.upload_count || 0;
                const totalSize = metrics.total_file_size || 0;
                const avgFileSize = uploadCount > 0 ? Math.round(totalSize / uploadCount) : 0;

                const { error } = await supabaseAdmin
                    .from('provider_usage')
                    .insert({
                        api_key_id: apiKeyId,
                        user_id: userId || null,
                        provider: provider,
                        upload_count: uploadCount,
                        total_file_size: totalSize,
                        average_file_size: avgFileSize, // ✅ FIX: Calculate average
                        last_used_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                if (error) {
                    console.error(`[Metrics Worker] ❌ Provider insert error:`, error.message);
                    continue;
                }
            }

            // Clear from Redis after successful sync
            await clearMetrics(key);
            workerMetrics.providersSynced++;

        } catch (error) {
            console.error('[Metrics Worker] ❌ Provider sync error:', error.message);
        }
    }
}

/**
 * Start the metrics sync worker
 */
export function startMetricsSyncWorker() {
    console.log(`[Metrics Worker] 🚀 Starting worker ${WORKER_ID}`);
    console.log(`[Metrics Worker] ⏰ Sync interval: ${SYNC_INTERVAL_MS}ms`);

    // Run immediately on start
    syncAllMetrics();

    // Then run every 5 seconds
    const intervalId = setInterval(syncAllMetrics, SYNC_INTERVAL_MS);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('[Metrics Worker] 🛑 Shutting down...');
        clearInterval(intervalId);
        await syncAllMetrics(); // Final sync
        console.log('[Metrics Worker] ✅ Final sync completed');
    });

    process.on('SIGINT', async () => {
        console.log('[Metrics Worker] 🛑 Interrupted, syncing...');
        clearInterval(intervalId);
        await syncAllMetrics(); // Final sync
        process.exit(0);
    });

    return intervalId;
}

/**
 * Get worker metrics for monitoring
 */
export function getWorkerMetrics() {
    return { ...workerMetrics };
}

// Start if run directly
if (process.argv[1]?.includes('metrics-worker')) {
    startMetricsSyncWorker();
}
