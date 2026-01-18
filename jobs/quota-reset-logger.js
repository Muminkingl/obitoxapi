/**
 * Monthly Quota Reset Job
 * 
 * Runs at the start of each month to log quota resets for all active users
 * 
 * Schedule: 1st of every month at 00:01 AM
 * 
 * Run with cron:
 *   0 1 1 * * node jobs/quota-reset-logger.js
 */

// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabaseAdmin } from '../config/supabase.js';
import { logAudit } from '../utils/audit-logger.js';
import { getMonthKey, getMonthEndTTL } from '../utils/quota-manager.js';

async function logMonthlyQuotaReset() {
    const startTime = Date.now();
    const month = getMonthKey();

    console.log(`🔄 [QUOTA RESET] Starting monthly quota reset logging...`);
    console.log(`📅 [QUOTA RESET] Month: ${month}`);

    try {
        const redis = await import('../config/redis.js').then(m => m.default);

        // Get all active users from profiles table
        const { data: users, error } = await supabaseAdmin
            .from('profiles')
            .select('id, subscription_tier')
            .not('subscription_tier', 'is', null);

        if (error) {
            console.error(`❌ [QUOTA RESET] Database error:`, error.message);
            return;
        }

        console.log(`👥 [QUOTA RESET] Found ${users.length} active users`);

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        // Log quota reset for each user
        for (const user of users) {
            try {
                // 🔥 DEDUPLICATION: Check if already logged for this user+month
                const dedupKey = `reset_logged:${user.id}:${month}`;
                const alreadyLogged = await redis.get(dedupKey);

                if (alreadyLogged) {
                    skipCount++;
                    continue; // Skip - already logged this month
                }

                // Log the reset
                await logAudit({
                    user_id: user.id,
                    resource_type: 'usage_quota',
                    event_type: 'usage_reset',
                    event_category: 'info',
                    description: `Monthly quota reset for ${month}`,
                    metadata: {
                        tier: user.subscription_tier,
                        reset_month: month,
                        automatic: true
                    }
                });

                // Mark as logged (TTL: until end of next month)
                const ttl = getMonthEndTTL() + (30 * 24 * 60 * 60); // Current month + ~30 days buffer
                await redis.setex(dedupKey, ttl, new Date().toISOString());

                successCount++;

                // Log progress every 100 users
                if (successCount % 100 === 0) {
                    console.log(`✅ [QUOTA RESET] Logged ${successCount}/${users.length} resets...`);
                }
            } catch (err) {
                failCount++;
                console.error(`❌ [QUOTA RESET] Failed for user ${user.id}:`, err.message);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`\n📊 [QUOTA RESET] Summary:`);
        console.log(`   ✅ Success: ${successCount}`);
        console.log(`   ⏭️  Skipped (already logged): ${skipCount}`);
        console.log(`   ❌ Failed: ${failCount}`);
        console.log(`   ⏱️  Duration: ${duration}ms`);
        console.log(`\n🎉 [QUOTA RESET] Monthly quota reset logging complete!`);

    } catch (error) {
        console.error(`❌ [QUOTA RESET] Fatal error:`, error.message);
        process.exit(1);
    }
}

// Run immediately when executed
logMonthlyQuotaReset()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
