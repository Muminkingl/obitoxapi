/**
 * Flush stale apikey: cache entries from Redis
 * Run from project root: node scripts/flush-apikey-cache.js
 */
import { Redis } from 'ioredis';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manually load .env.local
const envPath = resolve('.env.local');
try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
        if (match) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
        }
    }
} catch (e) {
    console.error('Could not load .env.local:', e.message);
}

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    console.error('REDIS_URL not found in env');
    process.exit(1);
}

console.log('Connecting to Redis...');
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, enableReadyCheck: false });

redis.on('ready', async () => {
    console.log('Connected.\n');
    let cursor = '0';
    let total = 0;

    do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'apikey:*', 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
            await redis.del(...keys);
            total += keys.length;
            for (const k of keys) console.log(`  ❌ Deleted: ${k}`);
        }
    } while (cursor !== '0');

    if (total === 0) {
        console.log('✅ No stale apikey: cache entries found — cache was already clean.');
    } else {
        console.log(`\n✅ Flushed ${total} stale apikey: cache entries. Next request will re-populate with clean data.`);
    }

    redis.disconnect();
    process.exit(0);
});

redis.on('error', (err) => {
    console.error('Redis error:', err.message);
    process.exit(1);
});
