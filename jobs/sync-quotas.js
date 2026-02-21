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
 */

import redis from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getMonthKey } from '../utils/quota-manager.js';
import logger from '../utils/logger.js';

/**
 * 🔥 Non-blocking SCAN helper (replaces redis.keys())
 * 
 * At 10K+ req/min, KEYS command blocks Redis for seconds.
 * SCAN iterates incrementally without blocking.
 * 
 * @param {object} redisClient - Redis client
 * @param {string} pattern - Key pattern (e.g., "quota:*:2026-01")
 * @returns {Promise<string[]>} - Array of matching keys
 */
async function scanKeys(redisClient, pattern) {
    const keys = [];
    let cursor = '0';

    do {
        // SCAN returns [cursor, [keys...]]
        const result = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = result[0];
        keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
}

/**
 * Sync Redis quotas to Supabase (runs every hour)
 */
export async function syncQuotasToDatabase() {
    logger.debug('[QUOTA SYNC] Starting hourly quota sync...');

    const month = getMonthKey();
    const pattern = `quota:*:${month}`;

    let synced = 0;
    let errors = 0;
    const startTime = Date.now();

    try {
        // 🔥 OPTIMIZED: Use SCAN instead of KEYS (non-blocking at 10K+ scale)
        // KEYS blocks Redis; SCAN iterates incrementally
        const keys = await scanKeys(redis, pattern);

        logger.debug(`[QUOTA SYNC] Found ${keys.length} quota keys to sync`);

        if (keys.length === 0) {
            logger.debug('[QUOTA SYNC] No quotas to sync');
            return;
        }

        // Batch sync (100 at a time to avoid overwhelming DB)
        const batchSize = 100;

        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);

            const syncData = await Promise.all(
                batch.map(async (key) => {
                    try {
                        const parts = key.split(':');
                        if (parts.length !== 3) {
                            logger.error(`[QUOTA SYNC] Invalid key format: ${key}`);
                            return null;
                        }

                        const userId = parts[1];
                        const count = await redis.get(key);

                        return {
                            user_id: userId,
                            month,
                            request_count: parseInt(count || '0'),
                            synced_at: new Date().toISOString()
                        };
                    } catch (err) {
                        logger.error(`[QUOTA SYNC] Error processing key ${key}:`, { message: err.message });
                        errors++;
                        return null;
                    }
                })
            );

            // Filter out nulls
            const validData = syncData.filter(d => d !== null);

            if (validData.length > 0) {
                // Upsert to database
                const { error } = await supabaseAdmin
                    .from('quota_usage')
                    .upsert(validData, {
                        onConflict: 'user_id,month'
                    });

                if (error) {
                    logger.error('[QUOTA SYNC] Database upsert error:', { error });
                    errors += validData.length;
                } else {
                    synced += validData.length;
                }
            }
        }

        const duration = Date.now() - startTime;
        logger.debug(`[QUOTA SYNC] Complete! Synced: ${synced}, Errors: ${errors}, Duration: ${duration}ms`);

    } catch (err) {
        logger.error('[QUOTA SYNC] Fatal error:', { message: err.message });
    }
}

// Start hourly sync job
logger.debug('[QUOTA SYNC] Starting hourly quota sync job...');
setInterval(syncQuotasToDatabase, 60 * 60 * 1000); // Every hour

// Delay first sync by 5 minutes to avoid startup Redis spike
// This prevents 20-40 Redis reads during app initialization
setTimeout(() => {
    syncQuotasToDatabase().catch(err => logger.error('[QUOTA SYNC] Error:', { message: err.message }));
    logger.debug('[QUOTA SYNC] First sync completed (was delayed 5 min to reduce startup load)');
}, 5 * 60 * 1000);

logger.debug('[QUOTA SYNC] First sync scheduled in 5 minutes...');
