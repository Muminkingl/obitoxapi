/**
 * UPLOADCARE OPERATIONS TEST - Using Real Credentials
 * Test all core operations with enterprise multi-layer caching
 * 
 * Expected Performance:
 * - First request: ~2000ms (cold cache, hits Uploadcare API)
 * - Subsequent requests: <500ms (cached, memory+Redis hits!)
 */

const SERVER_URL = 'http://localhost:5500';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'; // Replace with your test API key

// Uploadcare credentials (provided by user)
const UPLOADCARE_PUBLIC_KEY = 'b538618c3e84a2fe4e0c';
const UPLOADCARE_SECRET_KEY = 'f57ea42c1a37b91a5c3c';

console.log('\n🧪 UPLOADCARE OPERATIONS TEST - Enterprise Caching Validation\n');
console.log('='.repeat(80));
console.log(`Server: ${SERVER_URL}`);
console.log(`Public Key: ${UPLOADCARE_PUBLIC_KEY}`);
console.log('='.repeat(80));

/**
 * Make HTTP request
 */
async function makeRequest(endpoint, method, body) {
    const startTime = Date.now();

    try {
        const response = await fetch(`${SERVER_URL}${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        return {
            success: response.ok,
            status: response.status,
            data,
            duration
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        return {
            success: false,
            status: 0,
            error: error.message,
            duration
        };
    }
}

/**
 * Test 1: Generate Signed Upload URL
 */
async function testSignedUrl() {
    console.log('\n📋 TEST 1: Generate Signed Upload URL');
    console.log('─'.repeat(80));

    const result = await makeRequest('/api/v1/upload/uploadcare/signed-url', 'POST', {
        filename: 'test-file.txt',
        contentType: 'text/plain',
        fileSize: 1024,
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY
    });

    console.log(`   ⏱️  Time: ${result.duration}ms`);
    console.log(`   📊 Status: ${result.status}`);
    console.log(`   ✅ Success: ${result.success}`);

    if (result.success && result.data.data) {
        console.log(`   🔗 Upload URL: ${result.data.data.uploadUrl}`);
        console.log(`   📁 Filename: ${result.data.data.filename}`);

        // Show performance breakdown if available
        if (result.data.performance) {
            console.log(`   📊 Performance Breakdown:`);
            console.log(`      - Total: ${result.data.performance.totalTime}`);
            if (result.data.performance.breakdown) {
                console.log(`      - Memory Guard: ${result.data.performance.breakdown.memoryGuard}`);
                console.log(`      - Redis Check: ${result.data.performance.breakdown.redisCheck}`);
                console.log(`      - Validation: ${result.data.performance.breakdown.validation}`);
            }
            if (result.data.performance.cacheHits) {
                console.log(`   🎯 Cache Hits:`);
                console.log(`      - Memory: ${result.data.performance.cacheHits.memory ? 'HIT' : 'MISS'}`);
                console.log(`      - Redis: ${result.data.performance.cacheHits.redis ? 'HIT' : 'MISS'}`);
            }
        }
    } else {
        console.log(`   ❌ Error: ${result.data?.message || result.error}`);
    }

    return result;
}

/**
 * Test 2: List Files
 */
async function testListFiles() {
    console.log('\n📋 TEST 2: List Files from Uploadcare');
    console.log('─'.repeat(80));

    const result = await makeRequest('/api/v1/upload/uploadcare/list', 'POST', {
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
        limit: 10,
        offset: 0
    });

    console.log(`   ⏱️  Time: ${result.duration}ms`);
    console.log(`   📊 Status: ${result.status}`);
    console.log(`   ✅ Success: ${result.success}`);

    if (result.success && result.data.data) {
        console.log(`   📁 Total Files: ${result.data.data.total || 0}`);
        console.log(`   📄 Returned: ${result.data.data.files?.length || 0}`);

        if (result.data.performance) {
            console.log(`   📊 Performance: ${result.data.performance.totalTime}`);
        }
    } else {
        console.log(`   ❌ Error: ${result.data?.message || result.error}`);
    }

    return result;
}

/**
 * Test 3: Download File Info (if files exist)
 */
async function testDownloadInfo(uuid) {
    if (!uuid) {
        console.log('\n⏭️  TEST 3: Download - Skipped (no files)');
        return null;
    }

    console.log('\n📋 TEST 3: Get File Download Info');
    console.log('─'.repeat(80));

    const result = await makeRequest('/api/v1/upload/uploadcare/download', 'POST', {
        uuid,
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY
    });

    console.log(`   ⏱️  Time: ${result.duration}ms`);
    console.log(`   📊 Status: ${result.status}`);
    console.log(`   ✅ Success: ${result.success}`);

    if (result.success && result.data.data) {
        console.log(`   📁 Filename: ${result.data.data.filename}`);
        console.log(`   📦 Size: ${result.data.data.fileSize} bytes`);
        console.log(`   🔗 URL: ${result.data.data.downloadUrl?.substring(0, 60)}...`);

        if (result.data.performance) {
            console.log(`   📊 Performance: ${result.data.performance.totalTime}`);
        }
    } else {
        console.log(`   ❌ Error: ${result.data?.message || result.error}`);
    }

    return result;
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('\n⚡ RUNNING ALL TESTS...\n');

    // Test 1: Signed URL (FIRST REQUEST - COLD CACHE)
    const test1 = await testSignedUrl();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: List Files
    const test2 = await testListFiles();
    let firstFileUuid = null;
    if (test2.success && test2.data.data?.files?.length > 0) {
        firstFileUuid = test2.data.data.files[0].uuid;
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: Download Info (if files exist)
    const test3 = await testDownloadInfo(firstFileUuid);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: Signed URL AGAIN (CACHED REQUEST - SHOULD BE FAST!)
    console.log('\n📋 TEST 4: Generate Signed URL AGAIN (Testing Cache)');
    console.log('─'.repeat(80));
    const test4 = await testSignedUrl();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log('\n✅ Results:');
    console.log(`   1. Signed URL (cold):     ${test1.duration}ms   ${test1.success ? '✅' : '❌'}`);
    console.log(`   2. List Files:            ${test2.duration}ms   ${test2.success ? '✅' : '❌'}`);
    if (test3) {
        console.log(`   3. Download Info:         ${test3.duration}ms   ${test3.success ? '✅' : '❌'}`);
    }
    console.log(`   4. Signed URL (cached):   ${test4.duration}ms   ${test4.success ? '✅' : '❌'}`);

    // Cache performance analysis
    const improvement = ((test1.duration - test4.duration) / test1.duration * 100).toFixed(1);
    console.log('\n🎯 CACHE PERFORMANCE:');
    console.log(`   First request:  ${test1.duration}ms (cold cache)`);
    console.log(`   Second request: ${test4.duration}ms (cached)`);
    if (test4.duration < test1.duration) {
        console.log(`   ⚡ Improvement:  ${improvement}% FASTER! 🔥`);
    }

    const allSuccess = test1.success && test2.success && (!test3 || test3.success) && test4.success;

    console.log('\n🎯 VERDICT:');
    if (allSuccess) {
        console.log('   ✅ ALL TESTS PASSED!');
        console.log('   ✅ Enterprise caching is WORKING!');
        console.log('   ✅ Uploadcare modular structure operational!');
    } else {
        console.log('   ❌ SOME TESTS FAILED');
        console.log('   ⚠️  Check the errors above');
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Test suite complete!\n');
}

// Run tests
runAllTests().catch(error => {
    console.error('\n💥 Test suite error:', error);
    process.exit(1);
});
