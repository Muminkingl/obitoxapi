/**
 * PERFORMANCE TEST - Combined Middleware
 * 
 * Tests the optimized Phase 2 middleware to see actual response times
 * Expected: ~80ms (vs 370ms before)
 */

import crypto from 'crypto';
import fetch from 'node-fetch';

const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';

const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';

const BASE_URL = 'http://localhost:5500';


function generateSignature(method, path, timestamp, body, secret) {
    const bodyString = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
    const message = `${method.toUpperCase()}|${path}|${timestamp}|${bodyString}`;
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

async function testRequest(num) {
    const method = 'POST';
    const path = '/api/v1/upload/vercel/signed-url';
    const timestamp = Date.now();
    const body = {
        filename: 'test.txt',
        contentType: 'text/plain',
        vercelToken: 'vercel_blob_rw_WEy0MBq075aMvNFK_hek9h62PrD2fc8GchpVyFDGx7kXe6p'
    };

    const signature = generateSignature(method, path, timestamp, body, API_SECRET);
    const clientStart = Date.now();

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
                'X-API-Secret': API_SECRET,
                'X-Signature': signature,
                'X-Timestamp': timestamp.toString()
            },
            body: JSON.stringify(body)
        });

        const clientTime = Date.now() - clientStart;
        const data = await response.json();

        // Extract server timing if available
        const serverTime = data.processingTime || 'N/A';

        if (response.ok) {
            console.log(`✅ Request #${num}: ${clientTime}ms (client) | ${serverTime}ms (server)`);
            return { success: true, clientTime, serverTime };
        } else {
            console.log(`⚠️  Request #${num}: ${response.status} - ${data.error}`);
            console.log(`   Client time: ${clientTime}ms | Server time: ${serverTime}ms`);
            return { success: false, clientTime, serverTime, error: data.error };
        }
    } catch (error) {
        console.log(`❌ Request #${num}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

console.log('\n🚀 PERFORMANCE TEST - Optimized Combined Middleware\n');
console.log('='.repeat(80));
console.log('Testing Phase 2 optimizations:');
console.log('  - Parallel execution (Promise.all)');
console.log('  - Tier caching (5-min Redis cache)');
console.log('  - Atomic Lua scripts (race-free)');
console.log('='.repeat(80));
console.log('\n📊 Sending 10 test requests...\n');

async function runTest() {
    const results = [];

    for (let i = 1; i <= 10; i++) {
        const result = await testRequest(i);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📈 PERFORMANCE SUMMARY:\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
        const avgClientTime = Math.round(successful.reduce((sum, r) => sum + r.clientTime, 0) / successful.length);
        const serverTimes = successful.filter(r => typeof r.serverTime === 'number');
        const avgServerTime = serverTimes.length > 0
            ? Math.round(serverTimes.reduce((sum, r) => sum + r.serverTime, 0) / serverTimes.length)
            : 'N/A';

        console.log(`✅ Successful requests: ${successful.length}/${results.length}`);
        console.log(`📊 Average client time: ${avgClientTime}ms`);
        console.log(`⚡ Average server time: ${avgServerTime}ms`);

        console.log('\n🎯 Expected vs Actual:');
        console.log(`   Target (Phase 2): ~80ms server time`);
        console.log(`   Old (Phase 1):    ~370ms server time`);

        if (typeof avgServerTime === 'number') {
            const improvement = Math.round(((370 - avgServerTime) / 370) * 100);
            console.log(`   Improvement:      ${improvement}% faster! 🔥`);
        }
    }

    if (failed.length > 0) {
        console.log(`\n⚠️  Failed requests: ${failed.length}`);
        const rateLimited = failed.filter(r => r.error === 'RATE_LIMIT_EXCEEDED');
        if (rateLimited.length > 0) {
            console.log(`   Rate limited: ${rateLimited.length} (expected for FREE tier after 10 req/min)`);
        }
    }

    console.log('\n💡 Check server logs for detailed timing breakdown!\n');
}

runTest().catch(err => {
    console.error('\n❌ Test failed:', err.message);
});
