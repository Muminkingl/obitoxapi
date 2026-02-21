/**
 * Metrics Sync Worker (v4 - WITH FILE TYPE TRACKING)
 * 
 * Syncs consolidated Redis metrics to database periodically.
 * 
 * NEW KEY FORMAT: m:{apiKeyId}:{YYYY-MM-DD}
 * HASH FIELDS:
 *   req          - total request count
 *   p:{provider} - per-provider count (e.g., p:uploadcare, p:s3)
 *   ft:{mimeType} - file type count (e.g., ft:image/jpeg)
 *   fc:{category} - file category count (e.g., fc:image)
 *   ts           - last activity timestamp
 *   uid          - user ID
 */

import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getPendingMetrics, parseMetricsKey, parseMetricsData, getMetrics, clearMetrics } from '../lib/metrics/redis-counters.js';
import logger from '../utils/logger.js';

const WORKER_ID = `metrics-worker-${process.pid}`;

const stats = {
    runsCompleted: 0,
    apiKeysProcessed: 0,
    providersProcessed: 0,
    errors: 0
};

/**
 * Sync NEW-format consolidated metrics (m:{apiKeyId}:{date})
 */
async function syncConsolidatedMetrics() {
    const redisKeys = await getPendingMetrics();

    if (redisKeys.length === 0) return { apiKeys: 0, providers: 0 };

    let apiKeysProcessed = 0;
    let providersProcessed = 0;

    for (const key of redisKeys) {
        try {
            // Parse key to get apiKeyId and date
            const keyParts = parseMetricsKey(key);
            if (!keyParts) {
                await clearMetrics(key);
                continue;
            }

            // Get raw hash data
            const rawData = await getMetrics(key);
            if (!rawData) {
                await clearMetrics(key);
                continue;
            }

            // Parse into structured format
            const parsed = parseMetricsData(rawData);
            if (!parsed || parsed.totalRequests === 0) {
                await clearMetrics(key);
                continue;
            }

            const { apiKeyId, date } = keyParts;
            const { totalRequests, providers, fileTypes, fileCategories, lastUsedAt, userId } = parsed;

            // ─── 1. Update api_keys table (total requests + last_used_at + file types) ───
            const { data: current } = await supabaseAdmin
                .from('api_keys')
                .select('total_requests, total_files_uploaded, file_type_counts')
                .eq('id', apiKeyId)
                .single();

            if (current) {
                // Merge file types with existing
                const mergedFileTypes = current.file_type_counts || {};
                for (const [mimeType, typeCount] of Object.entries(fileTypes || {})) {
                    mergedFileTypes[mimeType] = (mergedFileTypes[mimeType] || 0) + typeCount;
                }

                const { error } = await supabaseAdmin
                    .from('api_keys')
                    .update({
                        total_requests: (current.total_requests || 0) + totalRequests,
                        total_files_uploaded: (current.total_files_uploaded || 0) + totalRequests,
                        file_type_counts: mergedFileTypes,
                        last_used_at: new Date(lastUsedAt).toISOString()
                    })
                    .eq('id', apiKeyId);

                if (error) {
                    logger.error(`[Metrics Worker] Error updating api_key ${apiKeyId}:`, { message: error.message });
                    continue;
                }
                apiKeysProcessed++;
            }

            // ─── 2. Update provider_usage table (per-provider counts + file types) ───
            for (const [provider, count] of Object.entries(providers)) {
                const { data: existing } = await supabaseAdmin
                    .from('provider_usage')
                    .select('id, upload_count, file_type_counts')
                    .eq('api_key_id', apiKeyId)
                    .eq('provider', provider)
                    .single();

                // Merge file types with existing
                const mergedFileTypes = existing?.file_type_counts || {};
                for (const [mimeType, typeCount] of Object.entries(fileTypes || {})) {
                    mergedFileTypes[mimeType] = (mergedFileTypes[mimeType] || 0) + typeCount;
                }

                if (existing) {
                    const { error } = await supabaseAdmin
                        .from('provider_usage')
                        .update({
                            upload_count: (existing.upload_count || 0) + count,
                            file_type_counts: mergedFileTypes,
                            last_used_at: new Date(lastUsedAt).toISOString()
                        })
                        .eq('id', existing.id);

                    if (error) {
                        logger.error(`[Metrics Worker] Error updating provider_usage:`, { message: error.message });
                        continue;
                    }
                } else {
                    const { error } = await supabaseAdmin
                        .from('provider_usage')
                        .insert({
                            api_key_id: apiKeyId,
                            user_id: userId,
                            provider: provider,
                            upload_count: count,
                            file_type_counts: fileTypes || {},
                            last_used_at: new Date(lastUsedAt).toISOString()
                        });

                    if (error) {
                        logger.error(`[Metrics Worker] Error inserting provider_usage:`, { message: error.message });
                        continue;
                    }
                }
                providersProcessed++;
            }

            // Clear from Redis after successful sync
            await clearMetrics(key);

        } catch (error) {
            logger.error(`[Metrics Worker] Error processing ${key}:`, { message: error.message });
            stats.errors++;
        }
    }

    return { apiKeys: apiKeysProcessed, providers: providersProcessed };
}

/**
 * Run metrics sync
 */
export async function startMetricsSyncWorker() {
    const startTime = Date.now();

    logger.debug(`[Metrics Worker] Starting sync...`);

    try {
        const { apiKeys, providers } = await syncConsolidatedMetrics();

        const elapsed = Date.now() - startTime;
        stats.runsCompleted++;
        stats.apiKeysProcessed += apiKeys;
        stats.providersProcessed += providers;

        logger.debug(`[Metrics Worker] COMPLETED in ${elapsed}ms`);
        logger.debug(`[Metrics Worker] API Keys: ${apiKeys}, Providers: ${providers}`);

    } catch (error) {
        logger.error('[Metrics Worker] Sync failed:', { message: error.message });
        stats.errors++;
    }
}

/**
 * Get worker stats
 */
export function getWorkerStats() {
    return { ...stats };
}

// Global error handlers - don't crash on ECONNRESET (Redis idle reset)
process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Metrics Worker] ECONNRESET (Redis idle reset, safe to ignore)');
        return;
    }
    logger.error(`[Metrics Worker] Worker crashed: ${msg}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('ECONNRESET')) {
        logger.debug('[Metrics Worker] ECONNRESET rejection (safe to ignore)');
        return;
    }
    logger.error(`[Metrics Worker] Unhandled rejection: ${msg}`);
});

// ========================
// MAIN ENTRY POINT
// ========================
const SYNC_INTERVAL_MS = 5000; // 5 seconds

async function main() {
    logger.info(`[Metrics Worker] Starting worker ${WORKER_ID}`);
    logger.info(`[Metrics Worker] Sync interval: ${SYNC_INTERVAL_MS}ms`);

    // Run immediately on startup
    await startMetricsSyncWorker();

    // Then run on interval
    setInterval(async () => {
        await startMetricsSyncWorker();
    }, SYNC_INTERVAL_MS);

    // Log stats every 5 minutes
    setInterval(() => {
        logger.info('[Metrics Worker] Stats:', stats);
    }, 300000);
}

main().catch(error => {
    logger.error('[Metrics Worker] Startup error:', { message: error.message });
    process.exit(1);
});
