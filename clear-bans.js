/**
 * Clear all rate limit bans and violations for a user
 * 
 * Run this to reset the test state:
 *   node clear-bans.js
 */

import { getRedis } from './config/redis.js';

const API_KEY = 'ox_f7dc6427f861ad84a59f8bbf46b16b5b04cea246629e96c7b11ab0bc8bc7fb66';

async function clearBans() {
    console.log('\n🧹 Clearing all bans and violations...\n');

    const redis = getRedis();

    if (!redis) {
        console.log('❌ Redis not available');
        process.exit(1);
    }

    const keys = [
        `ban:${API_KEY}`,
        `violations:${API_KEY}`,
        `rate_limited:${API_KEY}`,
        `requests:${API_KEY}`
    ];

    for (const key of keys) {
        const result = await redis.del(key);
        console.log(`   ${result ? '✅' : '⚪'} Deleted: ${key}`);
    }

    console.log('\n✅ All bans cleared! You can now test again.\n');
    process.exit(0);
}

clearBans().catch(console.error);
