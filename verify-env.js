import { config } from 'dotenv';
config({ path: '.env.local' });

const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

if (!redisUrl) {
    console.log('🔴 No Redis URL found in .env.local');
} else {
    try {
        const urlStr = redisUrl.includes('://') ? redisUrl : `redis://${redisUrl}`;
        const url = new URL(urlStr);
        console.log(`✅ Loaded Redis Host: ${url.hostname}`);
        console.log(`   (Scheme: ${url.protocol})`);
    } catch (e) {
        console.log('⚠️  Could not parse URL');
        console.log(`   Start: ${redisUrl.substring(0, 5)}...`);
    }
}
