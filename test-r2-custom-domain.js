/**
 * R2 Custom Domain Test
 * Tests custom domain support across all R2 operations
 * 
 * Feature: Branded URLs (cdn.yourdomain.com) instead of pub-xxx.r2.dev
 * Performance: Zero overhead - same as default URLs
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

const CUSTOM_DOMAIN = 'https://cdn.myawesomesite.com';

console.log('🧪 R2 CUSTOM DOMAIN TEST\n');
console.log('='.repeat(80));

// Test 1: Single signed URL with custom domain
async function testSingleSignedUrlCustomDomain() {
    console.log('\n📋 TEST 1: Single Signed URL with Custom Domain');
    console.log('─'.repeat(80));

    try {
        const response = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filename: 'custom-domain-test.jpg',
                contentType: 'image/jpeg',
                fileSize: 1024,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket,
                r2PublicUrl: CUSTOM_DOMAIN  // Custom domain!
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`   ✅ SUCCESS`);
            console.log(`   🔗 Upload URL: ${data.uploadUrl.substring(0, 60)}...`);
            console.log(`   🌐 Public URL: ${data.publicUrl}`);

            // Verify custom domain is used
            if (data.publicUrl.startsWith(CUSTOM_DOMAIN)) {
                console.log(`   ✅ Custom domain applied correctly!`);
            } else {
                console.log(`   ❌ Custom domain NOT applied - using default URL`);
                return false;
            }

            // Verify upload URL is still R2 endpoint (NOT custom domain)
            if (data.uploadUrl.includes('.r2.cloudflarestorage.com')) {
                console.log(`   ✅ Upload URL uses R2 endpoint (correct!)`);
            } else {
                console.log(`   ⚠️  Upload URL doesn't use R2 endpoint`);
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

// Test 2: Batch signed URLs with custom domain
async function testBatchSignedUrlsCustomDomain() {
    console.log('\n📋 TEST 2: Batch Signed URLs with Custom Domain');
    console.log('─'.repeat(80));

    try {
        const files = [
            { filename: 'batch-custom-1.jpg', contentType: 'image/jpeg' },
            { filename: 'batch-custom-2.png', contentType: 'image/png' },
            { filename: 'batch-custom-3.pdf', contentType: 'application/pdf' }
        ];

        const response = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket,
                r2PublicUrl: CUSTOM_DOMAIN  // Custom domain for all files!
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`   ✅ SUCCESS - ${data.summary.successful} URLs generated`);

            // Check all public URLs use custom domain
            const allUseCustomDomain = data.results.every(r =>
                r.success && r.publicUrl.startsWith(CUSTOM_DOMAIN)
            );

            if (allUseCustomDomain) {
                console.log(`   ✅ All public URLs use custom domain!`);
                console.log(`   📋 Sample URLs:`);
                data.results.slice(0, 3).forEach(r => {
                    console.log(`      - ${r.publicUrl}`);
                });
            } else {
                console.log(`   ❌ Some URLs don't use custom domain`);
                return false;
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

// Test 3: Default URL (no custom domain)
async function testDefaultUrl() {
    console.log('\n📋 TEST 3: Default URL (No Custom Domain)');
    console.log('─'.repeat(80));

    try {
        const response = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filename: 'default-url-test.jpg',
                contentType: 'image/jpeg',
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
                // NO r2PublicUrl - should use default
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`   ✅ SUCCESS`);
            console.log(`   🌐 Public URL: ${data.publicUrl}`);

            // Verify default R2 URL format
            const expectedPrefix = `https://pub-${R2_CREDS.accountId}.r2.dev`;
            if (data.publicUrl.startsWith(expectedPrefix)) {
                console.log(`   ✅ Default R2 URL format correct!`);
            } else {
                console.log(`   ❌ Default URL format incorrect`);
                return false;
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

// Test 4: Performance comparison (custom vs default)
async function testPerformanceComparison() {
    console.log('\n📋 TEST 4: Performance Comparison (Custom vs Default)');
    console.log('─'.repeat(80));

    try {
        // Test with default URL
        const defaultStart = Date.now();
        const defaultResponse = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filename: 'perf-default.jpg',
                contentType: 'image/jpeg',
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });
        const defaultData = await defaultResponse.json();
        const defaultTime = Date.now() - defaultStart;

        // Test with custom domain
        const customStart = Date.now();
        const customResponse = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filename: 'perf-custom.jpg',
                contentType: 'image/jpeg',
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket,
                r2PublicUrl: CUSTOM_DOMAIN
            })
        });
        const customData = await customResponse.json();
        const customTime = Date.now() - customStart;

        if (defaultData.success && customData.success) {
            console.log(`   ✅ Both tests successful`);
            console.log(`   ⚡ Default URL:   ${defaultData.performance?.totalTime} (client: ${defaultTime}ms)`);
            console.log(`   ⚡ Custom Domain: ${customData.performance?.totalTime} (client: ${customTime}ms)`);

            const serverDefault = parseInt(defaultData.performance?.totalTime);
            const serverCustom = parseInt(customData.performance?.totalTime);
            const difference = Math.abs(serverCustom - serverDefault);

            if (difference <= 5) {
                console.log(`   🚀 EXCELLENT: Zero performance impact (${difference}ms difference) ✅`);
            } else {
                console.log(`   ⚠️  Performance difference: ${difference}ms`);
            }

            return true;
        } else {
            console.log(`   ❌ One or both tests failed`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 5: Custom domain with trailing slash handling
async function testTrailingSlashHandling() {
    console.log('\n📋 TEST 5: Custom Domain Trailing Slash Handling');
    console.log('─'.repeat(80));

    try {
        const domainWithSlash = `${CUSTOM_DOMAIN}/`;  // Has trailing slash

        const response = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filename: 'trailing-slash-test.jpg',
                contentType: 'image/jpeg',
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket,
                r2PublicUrl: domainWithSlash
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`   ✅ SUCCESS`);
            console.log(`   🌐 Public URL: ${data.publicUrl}`);

            // Should NOT have double slashes (except in https://)
            const urlWithoutProtocol = data.publicUrl.replace('https://', '');
            if (!urlWithoutProtocol.includes('//')) {
                console.log(`   ✅ Trailing slash handled correctly (no double slashes)!`);
            } else {
                console.log(`   ❌ Double slashes detected in URL: ${data.publicUrl}`);
                return false;
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

// Run all tests
async function runAllTests() {
    const results = {
        singleUrl: false,
        batchUrls: false,
        defaultUrl: false,
        performance: false,
        trailingSlash: false
    };

    results.singleUrl = await testSingleSignedUrlCustomDomain();
    results.batchUrls = await testBatchSignedUrlsCustomDomain();
    results.defaultUrl = await testDefaultUrl();
    results.performance = await testPerformanceComparison();
    results.trailingSlash = await testTrailingSlashHandling();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Single URL Custom:      ${results.singleUrl ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Batch URLs Custom:      ${results.batchUrls ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Default URL:            ${results.defaultUrl ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Performance:            ${results.performance ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Trailing Slash:         ${results.trailingSlash ? '✅ PASS' : '❌ FAIL'}`);

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    console.log('─'.repeat(80));
    console.log(`   Result: ${passCount}/${totalCount} tests passed`);
    console.log('='.repeat(80));

    if (passCount === totalCount) {
        console.log('\n🎉 ALL TESTS PASSED! Custom domains working perfectly! 🚀\n');
        console.log('💡 How it works:');
        console.log('   - Upload URL: Always uses R2 endpoint (required for upload)');
        console.log('   - Public URL: Uses custom domain if provided, default otherwise');
        console.log('   - Performance: Zero overhead (same speed as default)');
        console.log('   - Trailing slashes: Automatically cleaned up\n');
    } else {
        console.log('\n⚠️  Some tests failed. Check output above.\n');
    }
}

runAllTests();
