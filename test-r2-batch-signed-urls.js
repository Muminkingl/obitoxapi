/**
 * R2 Batch Signed URLs Test
 * Tests batch generation of signed URLs with varying batch sizes
 * 
 * Performance Targets:
 * - 10 files: 50-80ms
 * - 50 files: 200-300ms
 * - 100 files: 400-500ms
 * - 4-5ms per file average
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5500/api/v1/upload';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';

const R2_CREDS = {
    accountId: 'b0cab7bc004505800b231cb8f9a793f4',
    accessKey: '67e3ba9f4da45799e5768e93de3ba4e8',
    secretKey: '0c578e0a7fa3c7f23affba1655b5345e7ef34fb1621238bd353b1b0f3eff1bbe',
    bucket: 'test'
};

console.log('🧪 R2 BATCH SIGNED URLS TEST\n');
console.log('='.repeat(80));

// Helper to generate file array
function generateFileArray(count) {
    return Array.from({ length: count }, (_, i) => ({
        filename: `batch-file-${i + 1}.jpg`,
        contentType: 'image/jpeg',
        fileSize: 1024 * (i + 1)  // Varied sizes
    }));
}

// Test 1: Batch too large (>100 files)
async function testBatchTooLarge() {
    console.log('\n📋 TEST 1: Batch Too Large (>100 files)');
    console.log('─'.repeat(80));

    try {
        const files = generateFileArray(150);  // Too many!

        const response = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();

        if (response.status === 400 && data.error === 'BATCH_TOO_LARGE') {
            console.log(`   ✅ PASS: Validation caught batch size limit`);
            console.log(`   📝 Error: ${data.error}`);
            console.log(`   💬 Message: ${data.message}`);
            return true;
        } else {
            console.log(`   ❌ FAIL: Should have rejected batch >100 files`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 2: Batch 10 files
async function testBatch10Files() {
    console.log('\n📋 TEST 2: Batch 10 Files');
    console.log('─'.repeat(80));

    try {
        const files = generateFileArray(10);
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files,
                expiresIn: 3600,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ SUCCESS in ${totalTime}ms`);
            console.log(`   📊 Summary: ${data.summary.successful}/${data.summary.total} successful`);
            console.log(`   ⏰ Expires In: ${data.expiresIn}s`);

            if (data.performance) {
                console.log(`\n   ⚡ PERFORMANCE BREAKDOWN:`);
                console.log(`      - Total Time: ${data.performance.totalTime}`);
                console.log(`      - Memory Guard: ${data.performance.breakdown?.memoryGuard}`);
                console.log(`      - Crypto Signing: ${data.performance.breakdown?.cryptoSigning}`);
                console.log(`      - Per File: ${data.performance.breakdown?.perFile}`);
            }

            // Check performance target
            const serverTime = parseInt(data.performance?.totalTime);
            if (serverTime < 80) {
                console.log(`\n   🚀 EXCELLENT: Server time ${serverTime}ms (target: <80ms) ✅`);
            } else if (serverTime < 120) {
                console.log(`\n   ✅ GOOD: Server time ${serverTime}ms (acceptable: <120ms)`);
            } else {
                console.log(`\n   ⚠️  SLOW: Server time ${serverTime}ms (target: <80ms)`);
            }

            return true;
        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 3: Batch 50 files
async function testBatch50Files() {
    console.log('\n📋 TEST 3: Batch 50 Files');
    console.log('─'.repeat(80));

    try {
        const files = generateFileArray(50);
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files,
                expiresIn: 3600,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ SUCCESS in ${totalTime}ms`);
            console.log(`   📊 Summary: ${data.summary.successful}/${data.summary.total} successful`);
            console.log(`   ⚡ Performance: ${data.performance.totalTime} (per file: ${data.performance.breakdown?.perFile})`);

            const serverTime = parseInt(data.performance?.totalTime);
            if (serverTime < 300) {
                console.log(`   🚀 EXCELLENT: ${serverTime}ms (target: <300ms) ✅`);
            } else if (serverTime < 400) {
                console.log(`   ✅ GOOD: ${serverTime}ms (acceptable: <400ms)`);
            } else {
                console.log(`   ⚠️  SLOW: ${serverTime}ms (target: <300ms)`);
            }

            return true;
        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 4: Batch 100 files
async function testBatch100Files() {
    console.log('\n📋 TEST 4: Batch 100 Files (Maximum)');
    console.log('─'.repeat(80));

    try {
        const files = generateFileArray(100);
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files,
                expiresIn: 3600,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ SUCCESS in ${totalTime}ms`);
            console.log(`   📊 Summary: ${data.summary.successful}/${data.summary.total} successful`);
            console.log(`   ⚡ Performance: ${data.performance.totalTime} (per file: ${data.performance.breakdown?.perFile})`);

            const serverTime = parseInt(data.performance?.totalTime);
            if (serverTime < 500) {
                console.log(`   🚀 EXCELLENT: ${serverTime}ms (target: <500ms) ✅`);
            } else if (serverTime < 800) {
                console.log(`   ✅ GOOD: ${serverTime}ms (acceptable: <800ms)`);
            } else {
                console.log(`   ⚠️  SLOW: ${serverTime}ms (target: <500ms)`);
            }

            return true;
        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 5: Individual file errors
async function testIndividualFileErrors() {
    console.log('\n📋 TEST 5: Individual File Error Handling');
    console.log('─'.repeat(80));

    try {
        const files = [
            { filename: 'valid-file.jpg', contentType: 'image/jpeg' },
            { filename: '', contentType: 'image/jpeg' },  // Invalid: no filename
            { filename: 'another-valid.jpg', contentType: 'image/jpeg' },
            { filename: 'missing-type.jpg' }  // Invalid: no contentType
        ];

        const response = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`   ✅ Batch processed (partial success expected)`);
            console.log(`   📊 Summary: ${data.summary.successful} successful, ${data.summary.failed} failed`);

            const failedResults = data.results.filter(r => !r.success);
            if (failedResults.length > 0) {
                console.log(`   📝 Failed files:`);
                failedResults.forEach(r => {
                    console.log(`      - ${r.originalFilename}: ${r.error}`);
                });
            }

            return data.summary.failed > 0;  // Pass if some failed (expected)
        } else {
            console.log(`   ❌ FAIL: Expected partial success`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    const results = {
        tooLarge: false,
        batch10: false,
        batch50: false,
        batch100: false,
        fileErrors: false
    };

    results.tooLarge = await testBatchTooLarge();
    results.batch10 = await testBatch10Files();
    results.batch50 = await testBatch50Files();
    results.batch100 = await testBatch100Files();
    results.fileErrors = await testIndividualFileErrors();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Batch Too Large:     ${results.tooLarge ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Batch 10 Files:      ${results.batch10 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Batch 50 Files:      ${results.batch50 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Batch 100 Files:     ${results.batch100 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   File Error Handling: ${results.fileErrors ? '✅ PASS' : '❌ FAIL'}`);

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    console.log('─'.repeat(80));
    console.log(`   Result: ${passCount}/${totalCount} tests passed`);
    console.log('='.repeat(80));

    if (passCount === totalCount) {
        console.log('\n🎉 ALL TESTS PASSED! Batch signed URLs working perfectly! 🚀\n');
    } else {
        console.log('\n⚠️  Some tests failed. Check output above.\n');
    }
}

runAllTests();
