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

// Also import legacy functions for transition period
import { getPendingApiKeyMetrics, getPendingProviderMetrics } from '../lib/metrics/redis-counters.js';

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
                    console.error(`[Metrics Worker] ❌ Error updating api_key ${apiKeyId}:`, error.message);
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
                        console.error(`[Metrics Worker] ❌ Error updating provider_usage:`, error.message);
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
                        console.error(`[Metrics Worker] ❌ Error inserting provider_usage:`, error.message);
                        continue;
                    }
                }
                providersProcessed++;
            }

            // Clear from Redis after successful sync
            await clearMetrics(key);

        } catch (error) {
            console.error(`[Metrics Worker] ❌ Error processing ${key}:`, error.message);
            stats.errors++;
        }
    }

    return { apiKeys: apiKeysProcessed, providers: providersProcessed };
}

/**
 * Sync OLD-format API key metrics (transition period — will self-clean in ~7 days)
 */
async function syncLegacyApiKeyMetrics() {
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

            const apiKeyId = key.replace('metrics:apikey:', '');
            if (!apiKeyId) {
                await clearMetrics(key);
                continue;
            }

            const { data: current } = await supabaseAdmin
                .from('api_keys')
                .select('total_requests, total_files_uploaded')
                .eq('id', apiKeyId)
                .single();

            if (current) {
                await supabaseAdmin
                    .from('api_keys')
                    .update({
                        total_requests: (current.total_requests || 0) + (metrics.total_requests || 0),
                        total_files_uploaded: (current.total_files_uploaded || 0) + (metrics.total_files_uploaded || 0),
                        last_used_at: new Date().toISOString()
                    })
                    .eq('id', apiKeyId);
            }

            await clearMetrics(key);
            processed++;
        } catch (error) {
            console.error(`[Metrics Worker] ❌ Legacy key error ${key}:`, error.message);
            stats.errors++;
        }
    }
    return processed;
}

/**
 * Sync OLD-format provider metrics (transition period)
 */
async function syncLegacyProviderMetrics() {
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

            const { data: existing } = await supabaseAdmin
                .from('provider_usage')
                .select('id, upload_count')
                .eq('api_key_id', apiKeyId)
                .eq('provider', provider)
                .single();

            if (existing) {
                await supabaseAdmin
                    .from('provider_usage')
                    .update({
                        upload_count: (existing.upload_count || 0) + (metrics.upload_count || 0),
                        last_used_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
            } else {
                await supabaseAdmin
                    .from('provider_usage')
                    .insert({
                        api_key_id: apiKeyId,
                        user_id: metrics.user_id,
                        provider,
                        upload_count: metrics.upload_count || 0,
                        last_used_at: new Date().toISOString()
                    });
            }

            await clearMetrics(key);
            processed++;
        } catch (error) {
            console.error(`[Metrics Worker] ❌ Legacy provider error ${key}:`, error.message);
            stats.errors++;
        }
    }
    return processed;
}

/**
 * Run metrics sync (handles both new and legacy format)
 */
export async function startMetricsSyncWorker() {
    const startTime = Date.now();

    console.log(`[Metrics Worker] 🚀 Starting sync...`);

    try {
        // New consolidated format
        const { apiKeys: newApiKeys, providers: newProviders } = await syncConsolidatedMetrics();

        // Legacy format (will auto-clean within 7 days)
        const legacyApiKeys = await syncLegacyApiKeyMetrics();
        const legacyProviders = await syncLegacyProviderMetrics();

        const totalApiKeys = newApiKeys + legacyApiKeys;
        const totalProviders = newProviders + legacyProviders;

        const elapsed = Date.now() - startTime;
        stats.runsCompleted++;
        stats.apiKeysProcessed += totalApiKeys;
        stats.providersProcessed += totalProviders;

        console.log(`[Metrics Worker] ✅ COMPLETED in ${elapsed}ms`);
        console.log(`[Metrics Worker] 📊 API Keys: ${totalApiKeys} (new:${newApiKeys}, legacy:${legacyApiKeys}), Providers: ${totalProviders} (new:${newProviders}, legacy:${legacyProviders})`);

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
