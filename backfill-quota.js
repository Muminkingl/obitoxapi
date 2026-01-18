/**
 * OPTIONAL: Backfill Quota System with Historical Data
 * 
 * Run this ONCE to sync the quota count with analytics
 * Only needed if you want accurate "this month" counts
 */

import redis from './config/redis.js';
import { supabaseAdmin } from './config/supabase.js';
import { getMonthKey, getMonthEndTTL } from './utils/quota-manager.js';

const USER_ID = 'fbe54d31-4aea-47ed-bb1d-e79fd66eae50';

async function backfillQuota() {
    console.log('🔄 Starting quota backfill...\n');

    try {
        // Step 1: Get actual request count from database (source of truth)
        console.log('📊 Step 1: Fetching request count from database...');

        const { data: apiKey, error } = await supabaseAdmin
            .from('api_keys')
            .select('total_requests, successful_requests, created_at')
            .eq('user_id', USER_ID)
            .single();

        if (error) throw error;

        console.log(`   Database shows: ${apiKey.total_requests} total requests`);
        console.log(`   API key created: ${apiKey.created_at}`);

        // Step 2: Calculate "this month" requests
        const keyCreatedDate = new Date(apiKey.created_at);
        const now = new Date();
        const sameMonth = keyCreatedDate.getMonth() === now.getMonth() &&
            keyCreatedDate.getFullYear() === now.getFullYear();

        let thisMonthCount;
        if (sameMonth) {
            // Key was created this month, so all requests are "this month"
            thisMonthCount = apiKey.total_requests;
            console.log(`   ✅ API key created this month (Jan ${keyCreatedDate.getDate()})`);
            console.log(`   All ${thisMonthCount} requests count toward this month's quota`);
        } else {
            // Key was created in previous month, can't backfill accurately
            console.log(`   ⚠️  API key created in a different month`);
            console.log(`   Cannot accurately determine "this month" count`);
            console.log(`   Recommendation: Wait until Feb 1st for clean reset`);
            process.exit(0);
        }

        // Step 3: Get current quota count
        console.log('\n📊 Step 2: Checking current quota count in Redis...');
        const month = getMonthKey();
        const quotaKey = `quota:${USER_ID}:${month}`;
        const currentQuota = parseInt(await redis.get(quotaKey) || '0');

        console.log(`   Current quota: ${currentQuota} requests`);
        console.log(`   Target quota: ${thisMonthCount} requests`);
        console.log(`   Difference: ${thisMonthCount - currentQuota} requests`);

        // Step 4: Ask for confirmation
        console.log('\n⚠️  WARNING: This will update the quota counter!');
        console.log(`   Old value: ${currentQuota}`);
        console.log(`   New value: ${thisMonthCount}`);
        console.log('');

        // Uncomment the next line to require manual confirmation
        // const readline = require('readline');
        // ... add confirmation prompt

        // Step 5: Update quota in Redis
        console.log('🔄 Step 3: Updating quota in Redis...');
        await redis.set(quotaKey, thisMonthCount);
        await redis.expire(quotaKey, getMonthEndTTL());

        console.log(`   ✅ Quota updated to ${thisMonthCount}`);

        // Step 6: Verify
        console.log('\n✅ Step 4: Verifying update...');
        const newQuota = await redis.get(quotaKey);
        console.log(`   Confirmed: Redis quota = ${newQuota}`);

        // Step 7: Trigger immediate sync to database
        console.log('\n🔄 Step 5: Syncing to database...');

        const { error: syncError } = await supabaseAdmin
            .from('quota_usage')
            .upsert({
                user_id: USER_ID,
                month,
                request_count: thisMonthCount,
                synced_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,month'
            });

        if (syncError) throw syncError;

        console.log('   ✅ Database synced successfully');

        console.log('\n🎉 Backfill Complete!');
        console.log(`   Your quota now shows: ${thisMonthCount} / 1000 requests this month`);
        console.log(`   This matches your analytics data.`);

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Backfill failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run backfill
backfillQuota();
