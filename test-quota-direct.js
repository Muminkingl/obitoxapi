/**
 * Direct test of quota manager functions
 * This bypasses the API and tests Redis directly
 */

import { incrementQuota, checkQuota, getMonthKey } from './utils/quota-manager.js';
import redis from './config/redis.js';

const TEST_USER_ID = 'fbe54d31-4aea-47ed-bb1d-e79fd66eae50';
const TEST_TIER = 'free';

async function testQuotaManager() {
    console.log('🧪 Testing Quota Manager Directly...\n');

    try {
        // Test 1: Check Redis connection
        console.log('📌 Test 1: Redis Connection');
        if (!redis) {
            console.log('   ❌ CRITICAL: Redis is NULL!');
            console.log('   The quota manager will fail!\n');
            process.exit(1);
        }

        const ping = await redis.ping();
        console.log(`   ✅ Redis is connected: ${ping}`);
        console.log('');

        // Test 2: Check current quota
        console.log('📌 Test 2: Check Current Quota');
        const quotaCheck = await checkQuota(TEST_USER_ID, TEST_TIER);
        console.log(`   Current: ${quotaCheck.current}/${quotaCheck.limit}`);
        console.log(`   Allowed: ${quotaCheck.allowed}`);
        console.log('');

        // Test 3: Increment quota
        console.log('📌 Test 3: Increment Quota (3 times)');
        for (let i = 1; i <= 3; i++) {
            const newCount = await incrementQuota(TEST_USER_ID, 1);
            console.log(`   Increment ${i}: New count = ${newCount}`);
        }
        console.log('');

        // Test 4: Verify increment worked
        console.log('📌 Test 4: Verify Quota After Increment');
        const quotaAfter = await checkQuota(TEST_USER_ID, TEST_TIER);
        console.log(`   Current: ${quotaAfter.current}/${quotaAfter.limit}`);
        console.log('');

        // Test 5: Check Redis key directly
        console.log('📌 Test 5: Check Redis Key Directly');
        const month = getMonthKey();
        const quotaKey = `quota:${TEST_USER_ID}:${month}`;
        const directValue = await redis.get(quotaKey);
        console.log(`   Key: ${quotaKey}`);
        console.log(`   Value: ${directValue || 'NULL (key does not exist!)'}`);
        console.log('');

        // Test 6: List all quota keys
        console.log('📌 Test 6: All Quota Keys in Redis');
        const allKeys = await redis.keys('quota:*');
        if (allKeys.length === 0) {
            console.log('   ⚠️  NO QUOTA KEYS FOUND!');
        } else {
            console.log(`   Found ${allKeys.length} keys:`);
            for (const key of allKeys) {
                const value = await redis.get(key);
                console.log(`   - ${key} = ${value}`);
            }
        }
        console.log('');

        console.log('✅ Test Complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test FAILED:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testQuotaManager();
