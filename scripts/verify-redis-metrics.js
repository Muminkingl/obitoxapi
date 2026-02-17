/**
 * Verify Redis Metrics (Phase 2)
 * 
 * Checks that metrics are being written to the new consolidated key format:
 * m:{apiKeyId}:{date}
 */

import { getRedis } from '../config/redis.js';

async function verifyMetrics() {
    console.log('🔍 Connecting to Redis...');
    const redis = getRedis();

    // Give it a moment to connect if needed
    if (redis.status !== 'ready') {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (redis.status !== 'ready') {
        console.error('❌ Redis not connected');
        process.exit(1);
    }

    console.log('✅ Redis connected');

    // Scan for new metrics keys
    console.log('🔍 Scanning for new metric keys (m:*)...');

    const keys = [];
    let cursor = '0';
    do {
        const [newCursor, foundKeys] = await redis.scan(
            cursor,
            'MATCH', 'm:*',
            'COUNT', 100
        );
        cursor = newCursor;
        keys.push(...foundKeys);
    } while (cursor !== '0');

    console.log(`📊 Found ${keys.length} new-format metric keys`);

    if (keys.length > 0) {
        console.log('\n📝 Inspecting first key:', keys[0]);
        const data = await redis.hgetall(keys[0]);
        console.log(data);

        // Validation
        const hasReq = 'req' in data;
        const hasTs = 'ts' in data;
        const hasProvider = Object.keys(data).some(k => k.startsWith('p:'));

        if (hasReq && hasTs) {
            console.log('\n✅ VALIDATION PASSED: Key has required fields (req, ts)');
            if (hasProvider) console.log('✅ Provider breakdown present');
            else console.log('ℹ️ No provider breakdown yet (maybe only API key tracked)');
        } else {
            console.error('\n❌ VALIDATION FAILED: Missing required fields');
            process.exit(1);
        }
    } else {
        console.warn('\n⚠️ No metrics found yet. Run some API requests first!');
    }

    process.exit(0);
}

verifyMetrics().catch(console.error);
