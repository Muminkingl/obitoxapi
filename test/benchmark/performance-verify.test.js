/**
 * ObitoX API Performance Benchmark
 * 
 * Verifies performance claims from documentation:
 * - R2 signed URL: 5-15ms (pure crypto)
 * - Vercel signed URL: 200-300ms (external API)
 * - Supabase signed URL: 848ms-1161ms (cache-dependent)
 * - Uploadcare signed URL: 536ms-639ms (cached)
 * 
 * Run: node test/benchmark/performance-verify.test.js
 */

import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const API_URL = 'http://localhost:5500';
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

// Provider credentials
const CREDENTIALS = {
    R2: {
        r2AccessKey: '8105c2c257b314edbc01fa0667cac2da',
        r2SecretKey: '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31',
        r2AccountId: 'b0cab7bc004505800b231cb8f9a793f4',
        r2Bucket: 'test'
    }
    // Add other provider credentials as needed
};

// Documentation claims (ms)
const PERFORMANCE_CLAIMS = {
    R2: { min: 5, max: 15, description: 'Pure crypto signing (no external API)' },
    VERCEL: { min: 200, max: 300, description: 'External Vercel API call' },
    SUPABASE: { min: 848, max: 1161, description: 'Multi-layer cache system' },
    UPLOADCARE: { min: 536, max: 639, description: 'Cached signed URL' }
};

// ============================================================================
// Helpers
// ============================================================================

function generateSignature(method, endpoint, body) {
    const timestamp = Date.now();
    const bodyString = JSON.stringify(body);
    const message = `${method}|${endpoint}|${timestamp}|${bodyString}`;

    const signature = crypto
        .createHmac('sha256', API_SECRET)
        .update(message)
        .digest('hex');

    return {
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString()
    };
}

async function makeRequest(method, endpoint, body) {
    const signatureHeaders = generateSignature(method, endpoint, body);

    const startTime = Date.now();
    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            'X-API-Secret': API_SECRET,
            ...signatureHeaders
        },
        body: JSON.stringify(body)
    });
    const endTime = Date.now();

    const data = await response.json();
    return {
        status: response.status,
        data,
        responseTime: endTime - startTime
    };
}

// ============================================================================
// Benchmark Functions
// ============================================================================

async function benchmarkR2SignedUrl(iterations = 5) {
    console.log('\n🔐 Benchmarking R2 Signed URL Generation...');
    console.log('─'.repeat(60));

    const times = [];

    for (let i = 1; i <= iterations; i++) {
        const filename = `benchmark-${Date.now()}-${i}.txt`;
        const body = {
            filename,
            contentType: 'text/plain',
            fileSize: 100,
            ...CREDENTIALS.R2
        };

        const result = await makeRequest('POST', '/api/v1/upload/r2/signed-url', body);

        if (result.status === 200 && result.data.success) {
            // Get server-reported time if available
            const serverTime = result.data.performance?.signingTime
                ? parseInt(result.data.performance.signingTime.replace('ms', ''))
                : null;

            times.push({
                iteration: i,
                responseTime: result.responseTime,
                serverTime: serverTime,
                totalTime: result.data.performance?.totalTime
            });

            console.log(`   #${i}: Response ${result.responseTime}ms | Server signing: ${serverTime || 'N/A'}ms`);
        } else {
            console.log(`   #${i}: ❌ Failed - ${result.data.error || result.data.message}`);
        }

        // Small delay between requests
        await new Promise(r => setTimeout(r, 100));
    }

    return times;
}

async function benchmarkMultipleProviders() {
    const results = {};

    // R2 Benchmark
    results.R2 = await benchmarkR2SignedUrl(5);

    // TODO: Add other providers when credentials are available
    // results.VERCEL = await benchmarkVercelSignedUrl(5);
    // results.SUPABASE = await benchmarkSupabaseSignedUrl(5);
    // results.UPLOADCARE = await benchmarkUploadcareSignedUrl(5);

    return results;
}

function analyzeResults(results) {
    console.log('\n' + '═'.repeat(70));
    console.log('📊 PERFORMANCE ANALYSIS');
    console.log('═'.repeat(70));

    for (const [provider, times] of Object.entries(results)) {
        if (!times || times.length === 0) continue;

        const responseTimes = times.map(t => t.responseTime).filter(t => t);
        const serverTimes = times.map(t => t.serverTime).filter(t => t);

        const avgResponse = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const minResponse = Math.min(...responseTimes);
        const maxResponse = Math.max(...responseTimes);

        const avgServer = serverTimes.length > 0
            ? serverTimes.reduce((a, b) => a + b, 0) / serverTimes.length
            : null;

        const claim = PERFORMANCE_CLAIMS[provider];

        console.log(`\n📦 ${provider}:`);
        console.log(`   📋 Documentation Claim: ${claim?.min}-${claim?.max}ms`);
        console.log(`   📋 Claim Description: ${claim?.description || 'N/A'}`);
        console.log('');
        console.log(`   📊 Actual Results (${times.length} samples):`);
        console.log(`      Response Time: min=${minResponse}ms, max=${maxResponse}ms, avg=${avgResponse.toFixed(0)}ms`);
        if (avgServer !== null) {
            console.log(`      Server Signing: avg=${avgServer.toFixed(0)}ms`);
        }

        // Verdict
        const withinClaim = avgServer !== null
            ? avgServer <= (claim?.max || Infinity) * 1.5  // Allow 50% margin for network
            : avgResponse <= (claim?.max || Infinity) * 3; // Allow 3x margin for full round-trip

        if (withinClaim) {
            console.log(`   ✅ VERDICT: Within acceptable range`);
        } else {
            console.log(`   ⚠️  VERDICT: May be slower than documented`);
            console.log(`      Note: Response includes network latency + API overhead`);
        }
    }
}

// ============================================================================
// Performance Breakdown Analysis
// ============================================================================

async function analyzeR2Performance() {
    console.log('\n' + '═'.repeat(70));
    console.log('🔬 R2 PERFORMANCE BREAKDOWN');
    console.log('═'.repeat(70));

    const filename = `breakdown-${Date.now()}.txt`;
    const body = {
        filename,
        contentType: 'text/plain',
        fileSize: 100,
        ...CREDENTIALS.R2
    };

    const result = await makeRequest('POST', '/api/v1/upload/r2/signed-url', body);

    if (result.status === 200 && result.data.success) {
        const perf = result.data.performance || {};

        console.log('\n   📊 Server-Reported Breakdown:');
        console.log(`      Total Time: ${perf.totalTime || result.responseTime + 'ms'}`);
        console.log(`      Signing Time: ${perf.signingTime || 'N/A'}`);
        console.log(`      Auth Time: ${perf.authTime || 'N/A'}`);
        console.log(`      DB Calls: ${perf.dbCalls || 'N/A'}`);
        console.log(`      Redis Calls: ${perf.redisCalls || 'N/A'}`);

        console.log('\n   📊 Network Overhead:');
        const serverTotalMs = perf.totalTime
            ? parseInt(perf.totalTime.replace('ms', ''))
            : 0;
        const networkOverhead = result.responseTime - serverTotalMs;
        console.log(`      Client Response Time: ${result.responseTime}ms`);
        console.log(`      Server Processing: ${serverTotalMs}ms`);
        console.log(`      Network Overhead: ~${networkOverhead}ms`);
    } else {
        console.log('   ❌ Failed to analyze - request failed');
    }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('🚀 ObitoX Performance Benchmark\n');
    console.log('═'.repeat(70));
    console.log('Verifying performance claims from documentation...');
    console.log('═'.repeat(70));

    try {
        // Check API is running
        console.log('\n🔌 Checking API connection...');
        const healthCheck = await fetch(`${API_URL}/health`).catch(() => null);
        if (!healthCheck) {
            console.log('   ❌ API server not running! Start with: npm start');
            process.exit(1);
        }
        console.log('   ✅ API server is running');

        // Run benchmarks
        const results = await benchmarkMultipleProviders();

        // Analyze results
        analyzeResults(results);

        // Deep dive on R2
        await analyzeR2Performance();

        // Summary
        console.log('\n' + '═'.repeat(70));
        console.log('📋 SUMMARY');
        console.log('═'.repeat(70));
        console.log('\n   Key Findings:');
        console.log('   - Response times include: network latency + auth + signing + DB/Redis');
        console.log('   - Server signing time (pure crypto) should match documentation');
        console.log('   - Total response time will be higher due to API overhead');
        console.log('\n   To improve accuracy:');
        console.log('   - Check server-reported signing time in performance field');
        console.log('   - Run benchmarks multiple times (warm/cold cache)');

    } catch (error) {
        console.error('\n❌ Benchmark failed:', error.message);
        process.exit(1);
    }
}

main();
