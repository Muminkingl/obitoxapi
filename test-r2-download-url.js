/**
 * R2 Download URL Test
 * Tests time-limited download URL generation with expiry validation
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

console.log('🧪 R2 DOWNLOAD URL TEST\n');
console.log('='.repeat(80));

// Test 1: Invalid expiry (too short)
async function testInvalidExpiryTooShort() {
    console.log('\n📋 TEST 1: Invalid Expiry - Too Short (<60s)');
    console.log('─'.repeat(80));

    try {
        const response = await fetch(`${API_BASE}/r2/download-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                fileKey: 'test-file.txt',
                expiresIn: 30,  // Too short!
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();

        if (response.status === 400 && data.error === 'INVALID_EXPIRY') {
            console.log(`   ✅ PASS: Validation caught invalid expiry`);
            console.log(`   📝 Error: ${data.error}`);
            console.log(`   💬 Message: ${data.message}`);
            return true;
        } else {
            console.log(`   ❌ FAIL: Should have rejected expiry <60s`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 2: Invalid expiry (too long)
async function testInvalidExpiryTooLong() {
    console.log('\n📋 TEST 2: Invalid Expiry - Too Long (>7 days)');
    console.log('─'.repeat(80));

    try {
        const response = await fetch(`${API_BASE}/r2/download-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                fileKey: 'test-file.txt',
                expiresIn: 700000,  // >7 days!
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();

        if (response.status === 400 && data.error === 'INVALID_EXPIRY') {
            console.log(`   ✅ PASS: Validation caught invalid expiry`);
            console.log(`   📝 Error: ${data.error}`);
            console.log(`   💬 Message: ${data.message}`);
            return true;
        } else {
            console.log(`   ❌ FAIL: Should have rejected expiry >7 days`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 3: Valid download URL generation
async function testValidDownloadUrl() {
    console.log('\n📋 TEST 3: Valid Download URL Generation');
    console.log('─'.repeat(80));

    try {
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/download-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                fileKey: '79cb8086_test-upload_1767026142966_sfrl2u.txt',  // File we uploaded earlier
                expiresIn: 3600,  // 1 hour
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
            console.log(`   🔗 Download URL: ${data.downloadUrl.substring(0, 80)}...`);
            console.log(`   🌐 Public URL: ${data.publicUrl}`);
            console.log(`   📄 File: ${data.fileKey}`);
            console.log(`   ⏰ Expires In: ${data.expiresIn}s`);
            console.log(`   📅 Expires At: ${data.expiresAt}`);

            if (data.performance) {
                console.log(`\n   ⚡ PERFORMANCE BREAKDOWN:`);
                console.log(`      - Total Time: ${data.performance.totalTime}`);
                console.log(`      - Memory Guard: ${data.performance.breakdown?.memoryGuard}`);
                console.log(`      - Crypto Signing: ${data.performance.breakdown?.cryptoSigning}`);
            }

            // Check performance target
            const serverTime = parseInt(data.performance?.totalTime);
            if (serverTime < 30) {
                console.log(`\n   🚀 EXCELLENT: Server time ${serverTime}ms (target: <30ms) ✅`);
            } else if (serverTime < 50) {
                console.log(`\n   ✅ GOOD: Server time ${serverTime}ms (acceptable: <50ms)`);
            } else {
                console.log(`\n   ⚠️  SLOW: Server time ${serverTime}ms (target: <30ms)`);
            }

            return data.downloadUrl;

        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            console.log(`   Error: ${data.error}`);
            return null;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return null;
    }
}

// Test 4: Verify download URL works
async function testDownloadUrlWorks(downloadUrl) {
    console.log('\n📋 TEST 4: Verify Download URL Works');
    console.log('─'.repeat(80));

    if (!downloadUrl) {
        console.log('   ⚠️  Skipped (no download URL)');
        return false;
    }

    try {
        const response = await fetch(downloadUrl);

        if (response.ok) {
            const content = await response.text();
            console.log(`   ✅ Download successful`);
            console.log(`   📊 Status: ${response.status} ${response.statusText}`);
            console.log(`   📏 Size: ${content.length} bytes`);
            console.log(`   📄 Content preview: ${content.substring(0, 100)}...`);
            return true;
        } else {
            console.log(`   ❌ Download failed: ${response.status}`);
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
        invalidTooShort: false,
        invalidTooLong: false,
        validGeneration: false,
        downloadWorks: false
    };

    results.invalidTooShort = await testInvalidExpiryTooShort();
    results.invalidTooLong = await testInvalidExpiryTooLong();

    const downloadUrl = await testValidDownloadUrl();
    results.validGeneration = downloadUrl !== null;
    results.downloadWorks = await testDownloadUrlWorks(downloadUrl);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Invalid (<60s):       ${results.invalidTooShort ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Invalid (>7 days):    ${results.invalidTooLong ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Valid Generation:     ${results.validGeneration ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Download Works:       ${results.downloadWorks ? '✅ PASS' : '❌ FAIL'}`);

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    console.log('─'.repeat(80));
    console.log(`   Result: ${passCount}/${totalCount} tests passed`);
    console.log('='.repeat(80));

    if (passCount === totalCount) {
        console.log('\n🎉 ALL TESTS PASSED! Download URLs are working! 🚀\n');
    } else {
        console.log('\n⚠️  Some tests failed. Check output above.\n');
    }
}

runAllTests();
