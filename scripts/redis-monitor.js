/**
 * Redis Monitor — snapshot of all relevant keys
 * Usage: node scripts/redis-monitor.js
 */
import { getRedis } from '../config/redis.js';

const redis = getRedis();

async function monitor() {
    console.log('\n══════════════════════════════════════════════');
    console.log('         REDIS SNAPSHOT  ' + new Date().toISOString());
    console.log('══════════════════════════════════════════════\n');

    // 1. Pending metric keys (m:{apiKeyId}:{date})
    const metricKeys = await redis.keys('m:*');
    console.log(`📊 Pending metric keys: ${metricKeys.length}`);
    for (const key of metricKeys) {
        const data = await redis.hgetall(key);
        console.log(`   ${key}`);
        console.log(`     req=${data.req || 0}  uid=${data.uid || '?'}  ts=${data.ts || '?'}`);
        // provider fields
        const providers = Object.entries(data).filter(([k]) => k.startsWith('p:'));
        if (providers.length) {
            console.log(`     providers: ${providers.map(([k, v]) => `${k}=${v}`).join('  ')}`);
        }
    }

    // 2. Quota keys (quota:{userId}:{month})
    const quotaKeys = await redis.keys('quota:*');
    console.log(`\n💳 Quota keys: ${quotaKeys.length}`);
    if (quotaKeys.length > 0) {
        const vals = await redis.mget(...quotaKeys);
        quotaKeys.forEach((k, i) => {
            console.log(`   ${k}  =  ${vals[i] || 0} requests`);
        });
    }

    // 3. Audit queue
    const auditLen = await redis.llen('audit:queue');
    const auditFailed = await redis.llen('audit:failed');
    console.log(`\n📋 Audit queue depth: ${auditLen}  (failed: ${auditFailed})`);

    // 4. Rate limit / ban keys
    const banKeys = await redis.keys('ban:*');
    const rateKeys = await redis.keys('rl:*');
    console.log(`\n🚫 Active bans: ${banKeys.length}`);
    console.log(`⏱️  Rate limit windows open: ${rateKeys.length}`);

    // 5. Daily rollup lock
    const lockKeys = await redis.keys('audit:rollup:lock:*');
    console.log(`\n🔒 Rollup locks: ${lockKeys.length}${lockKeys.length ? ' — ' + lockKeys.join(', ') : ''}`);

    // 6. API key cache
    const cacheKeys = await redis.keys('apikey:*');
    console.log(`\n🗝️  Cached API keys (L2): ${cacheKeys.length}`);

    console.log('\n══════════════════════════════════════════════\n');
    process.exit(0);
}

monitor().catch(e => { console.error(e.message); process.exit(1); });
