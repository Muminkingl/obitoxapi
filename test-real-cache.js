/**
 * Test Cache on ACTUAL Upload Endpoint (not /validate)
 * The /validate endpoint doesn't use cache middleware!
 * This tests the real upload endpoints that DO use caching
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const YOUR_API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';
const VERCEL_TOKEN = 'vercel_blob_rw_WEy0MBq075aMvNFK_hek9h62PrD2fc8GchpVyFDGx7kXe6p';
const SERVER_URL = 'http://localhost:5500';

console.log('\n🔍 TESTING CACHE ON REAL UPLOAD ENDPOINT\n');
console.log('='.repeat(80));
console.log('The /validate endpoint does NOT use cache!');
console.log('Testing /vercel/signed-url which DOES use apikey.middleware.optimized.js');
console.log('='.repeat(80));

async function testUploadEndpoint(requestNum) {
    const start = Date.now();

    const response = await fetch(`${SERVER_URL}/api/v1/upload/vercel/signed-url`, {
        method: 'POST',
        headers: {
            'x-api-key': YOUR_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filename: `test-${Date.now()}.txt`,
            contentType: 'text/plain',
            vercelToken: VERCEL_TOKEN,
            fileSize: 100
        })
    });

    const time = Date.now() - start;
    const data = await response.json();

    return {
        requestNum,
        time,
        success: response.ok
    };
}

async function runTest() {
    console.log('\n📋 Request #1 (Cache MISS - First time hitting middleware)');
    const test1 = await testUploadEndpoint(1);
    console.log(`   ⏱️  ${test1.time}ms`);

    await new Promise(r => setTimeout(r, 500));

    console.log('\n📋 Request #2 (Cache HIT - API key should be in Redis now)');
    const test2 = await testUploadEndpoint(2);
    console.log(`   ⏱️  ${test2.time}ms`);

    await new Promise(r => setTimeout(r, 500));

    console.log('\n📋 Request #3 (Cache HIT - Verify consistency)');
    const test3 = await testUploadEndpoint(3);
    console.log(`   ⏱️  ${test3.time}ms`);

    const improvement = test1.time - test2.time;
    const percent = ((improvement / test1.time) * 100).toFixed(1);

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTS');
    console.log('='.repeat(80));
    console.log(`\nRequest #1: ${test1.time}ms (Cache MISS)`);
    console.log(`Request #2: ${test2.time}ms (Cache HIT)`);
    console.log(`Request #3: ${test3.time}ms (Cache HIT)`);
    console.log(`\n🎯 Improvement: ${improvement}ms (${percent}%)`);

    if (improvement > 50) {
        console.log('\n✅ REDIS IS WORKING! Cache providing significant speedup!');
        console.log(`✅ ${percent}% faster with cached API key`);
    } else if (improvement > 0) {
        console.log('\n⚠️  Small improvement detected');
        console.log('   Redis might be working but improvement is masked by other factors');
    } else {
        console.log('\n❌ NO IMPROVEMENT - Redis cache may not be working!');
    }

    console.log('\n💡 Note: /validate endpoint does NOT use cache middleware');
    console.log('   That\'s why it was slow (1500ms) - it makes 5 Supabase queries');
    console.log('   Upload endpoints DO use cache - much faster!\n');
}

runTest().then(() => console.log('Done!\n'));
