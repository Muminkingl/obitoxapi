/**
 * R2 Integration Test
 * Tests enterprise R2 implementation with real credentials
 * Following Rule #10: Test invalid credentials first, then valid
 */

import fetch from 'node-fetch';

// Test configuration
const API_BASE = 'http://localhost:5500/api/v1/upload';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';

// R2 Credentials (from credints.md)
const R2_CREDS = {
    accountId: 'b0cab7bc004505800b231cb8f9a793f4',
    accessKey: '67e3ba9f4da45799e5768e93de3ba4e8',
    secretKey: '0c578e0a7fa3c7f23affba1655b5345e7ef34fb1621238bd353b1b0f3eff1bbe',
    bucket: 'test' // Change this to your actual bucket name
};

console.log('🧪 R2 ENTERPRISE INTEGRATION TEST\n');
console.log('='.repeat(80));

// Test 1: Invalid Access Key (should fail with clear error)
async function testInvalidAccessKey() {
    console.log('\n📋 TEST 1: Invalid Access Key Format');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                filename: 'test.jpg',
                contentType: 'image/jpeg',
                r2AccessKey: 'invalid',  // Too short
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const time = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${time}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Expected: Error with clear message`);
        console.log(`   📝 Error: ${data.error}`);
        console.log(`   💬 Message: ${data.message}`);
        console.log(`   💡 Hint: ${data.hint || 'N/A'}`);

        if (response.status === 400 && data.error) {
            console.log(`   ✅ PASS: Validation caught invalid format`);
        } else {
            console.log(`   ❌ FAIL: Should have rejected invalid access key`);
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
    }
}

// Test 2: Invalid Account ID (should fail with clear error)
async function testInvalidAccountId() {
    console.log('\n📋 TEST 2: Invalid Account ID Format');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                filename: 'test.jpg',
                contentType: 'image/jpeg',
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: 'invalid-account-id',  // Wrong format
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const time = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${time}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   📝 Error: ${data.error}`);
        console.log(`   💬 Message: ${data.message}`);

        if (response.status === 400) {
            console.log(`   ✅ PASS: Validation caught invalid account ID`);
        } else {
            console.log(`   ❌ FAIL: Should have rejected invalid account ID`);
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
    }
}

// Test 3: Valid Credentials - Generate Signed URL (should succeed FAST!)
async function testValidSignedUrl() {
    console.log('\n📋 TEST 3: Valid Credentials - Generate Signed URL');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                filename: 'test-enterprise.jpg',
                contentType: 'image/jpeg',
                fileSize: 1024000,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket,
                expiresIn: 3600
            })
        });

        const data = await response.json();
        const time = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${time}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Success: ${data.success}`);

        if (data.success) {
            console.log(`   🔗 Upload URL: ${data.uploadUrl?.substring(0, 80)}...`);
            console.log(`   🌐 Public URL: ${data.publicUrl}`);
            console.log(`   🆔 Upload ID: ${data.uploadId}`);
            console.log(`   ⏰ Expires In: ${data.expiresIn}s`);

            if (data.performance) {
                console.log(`\n   ⚡ PERFORMANCE BREAKDOWN:`);
                console.log(`      - Total Time: ${data.performance.totalTime}`);
                console.log(`      - Memory Guard: ${data.performance.breakdown?.memoryGuard || 'N/A'}`);
                console.log(`      - Redis Check: ${data.performance.breakdown?.redisCheck || 'N/A'}`);
                console.log(`      - Crypto Signing: ${data.performance.breakdown?.cryptoSigning || 'N/A'}`);
            }

            // Check if fast (target: <20ms)
            if (time < 20) {
                console.log(`   🚀 EXCELLENT: Response in ${time}ms (target: <20ms)`);
            } else if (time < 50) {
                console.log(`   ✅ GOOD: Response in ${time}ms`);
            } else {
                console.log(`   ⚠️  SLOW: Response in ${time}ms (target: <20ms)`);
            }

            console.log(`   ✅ PASS: Signed URL generated successfully`);
        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            console.log(`   Error: ${data.error}`);
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
    }
}

// Test 4: List Files (optional - requires bucket to exist)
async function testListFiles() {
    console.log('\n📋 TEST 4: List Files in R2 Bucket');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${API_BASE}/r2/list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket,
                maxKeys: 10
            })
        });

        const data = await response.json();
        const time = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${time}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Success: ${data.success}`);

        if (data.success) {
            console.log(`   📁 Bucket: ${data.data?.bucket}`);
            console.log(`   📄 File Count: ${data.data?.count || 0}`);

            if (data.data?.files && data.data.files.length > 0) {
                console.log(`\n   Files:`);
                data.data.files.forEach((file, i) => {
                    console.log(`      ${i + 1}. ${file.key} (${file.size} bytes)`);
                });
            } else {
                console.log(`   📭 No files in bucket (empty or new bucket)`);
            }

            console.log(`   ✅ PASS: List operation successful`);
        } else {
            console.log(`   ℹ️  Info: ${data.message}`);
            if (data.error === 'LIST_FAILED') {
                console.log(`   💡 Note: Bucket might not exist yet. Create it first in Cloudflare dashboard.`);
            }
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
    }
}

// Run all tests
async function runAllTests() {
    console.log(`Server: ${API_BASE}`);
    console.log(`Account ID: ${R2_CREDS.accountId}`);
    console.log(`Bucket: ${R2_CREDS.bucket}`);
    console.log('='.repeat(80));

    // Test failures first (Rule #10)
    await testInvalidAccessKey();
    await testInvalidAccountId();

    // Then test success
    await testValidSignedUrl();
    await testListFiles();

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test suite complete!\n');
}

// Execute
runAllTests().catch(console.error);
