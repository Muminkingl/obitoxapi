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

/**
 * Sync Redis quotas to Supabase (runs every hour)
 */
export async function syncQuotasToDatabase() {
    console.log('[QUOTA SYNC] Starting hourly quota sync...');

    const month = getMonthKey();
    const pattern = `quota:*:${month}`;

    let synced = 0;
    let errors = 0;
    const startTime = Date.now();

    try {
        // Get all quota keys for current month
        const keys = await redis.keys(pattern);

        console.log(`[QUOTA SYNC] Found ${keys.length} quota keys to sync`);

        if (keys.length === 0) {
            console.log('[QUOTA SYNC] No quotas to sync');
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
                            console.error(`[QUOTA SYNC] Invalid key format: ${key}`);
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
                        console.error(`[QUOTA SYNC] Error processing key ${key}:`, err.message);
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
                    console.error('[QUOTA SYNC] Database upsert error:', error);
                    errors += validData.length;
                } else {
                    synced += validData.length;
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[QUOTA SYNC] Complete! Synced: ${synced}, Errors: ${errors}, Duration: ${duration}ms`);

    } catch (err) {
        console.error('[QUOTA SYNC] Fatal error:', err);
    }
}

// Start hourly sync job
console.log('[QUOTA SYNC] Starting hourly quota sync job...');
setInterval(syncQuotasToDatabase, 60 * 60 * 1000); // Every hour

// Also run on startup (sync any missed data)
syncQuotasToDatabase().catch(console.error);
