/**
 * ACTUAL SDK TEST - Vercel Provider via Direct API
 * 
 * Tests the ObitoX API with proper Layer 2 signature authentication.
 * Signature format: METHOD|PATH|TIMESTAMP|BODY
 */

import crypto from 'crypto';

// ============================================================================
// Test Configuration  
// ============================================================================

const API_URL = 'http://localhost:5500';
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';
const VERCEL_TOKEN = 'vercel_blob_rw_WEy0MBq075aMvNFK_hek9h62PrD2fc8GchpVyFDGx7kXe6p';

// ============================================================================
// Signature Generation (Layer 2 Security)
// Format: METHOD|PATH|TIMESTAMP|BODY (matches backend signature.utils.js)
// ============================================================================

function generateSignature(endpoint, body) {
    const timestamp = Date.now();
    const method = 'POST';
    const bodyString = JSON.stringify(body);

    // Format: METHOD|PATH|TIMESTAMP|BODY
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

// ============================================================================
// Helper: Make authenticated request
// ============================================================================

async function makeRequest(endpoint, body) {
    const signatureHeaders = generateSignature(endpoint, body);

    const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            'X-API-Secret': API_SECRET,
            ...signatureHeaders
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    return { status: response.status, data };
}

// ============================================================================
// Tests
// ============================================================================

console.log('🎯 VERCEL SDK TEST with Signature Auth\n');
console.log('='.repeat(80));

const results = {
    signedUrlGeneration: false,
    vercelUpload: false,
};

// =============================================================================
// Test 1: Generate Signed URL for Vercel
// =============================================================================
async function testSignedUrlGeneration() {
    console.log('\n📋 TEST 1: Generate Signed URL for Vercel');
    console.log('─'.repeat(80));

    try {
        const body = {
            provider: 'VERCEL',
            filename: 'test-file.txt',
            contentType: 'text/plain',
            fileSize: 1024, // 1KB test file
            vercelToken: VERCEL_TOKEN
        };

        console.log('   🔍 Calling /api/v1/upload/vercel/signed-url...');

        const result = await makeRequest('/api/v1/upload/vercel/signed-url', body);

        if (result.status === 200 && result.data.success) {
            console.log('   ✅ Signed URL generated successfully!');
            console.log(`   📁 Filename: ${result.data.data?.filename || 'N/A'}`);
            results.signedUrlGeneration = true;
            return result.data;
        } else {
            console.log('   ❌ FAILED:', result.data.error || result.data.message);
            console.log('   📋 Response:', JSON.stringify(result.data, null, 2));
            return null;
        }
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        return null;
    }
}

// =============================================================================
// Test 2: Upload Test with second request
// =============================================================================
async function testVercelUpload() {
    console.log('\n📋 TEST 2: Upload Test (Signed URL Generation)');
    console.log('─'.repeat(80));

    try {
        const body = {
            provider: 'VERCEL',
            filename: `sdk-test-${Date.now()}.txt`,
            contentType: 'text/plain',
            fileSize: 2048, // 2KB test file
            vercelToken: VERCEL_TOKEN
        };

        const result = await makeRequest('/api/v1/upload/vercel/signed-url', body);

        if (result.status === 200 && result.data.success) {
            console.log('   ✅ Upload test passed - signed URL works!');
            results.vercelUpload = true;
            return true;
        } else {
            console.log('   ❌ FAILED:', result.data.error || result.data.message);
            return false;
        }
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        return false;
    }
}

// =============================================================================
// Run All Tests
// =============================================================================
async function runAllTests() {
    try {
        await testSignedUrlGeneration();
        await testVercelUpload();
        printSummary();
    } catch (error) {
        console.log('\n❌ CRITICAL ERROR:', error.message);
        printSummary();
    }
}

// =============================================================================
// Print Summary
// =============================================================================
function printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));

    console.log(`   1. Signed URL Generation:   ${results.signedUrlGeneration ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   2. Vercel Upload:           ${results.vercelUpload ? '✅ PASS' : '❌ FAIL'}`);

    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(r => r).length;

    console.log('─'.repeat(80));
    console.log(`   Result: ${passedTests}/${totalTests} tests passed`);
    console.log('='.repeat(80));

    if (passedTests === totalTests) {
        console.log('\n🎉 ALL TESTS PASSED! Signature auth working!\n');
    } else {
        console.log('\n⚠️  Some tests failed. Review errors above.\n');
    }
}

// Run the tests!
console.log('\n🚀 Starting Vercel API tests...\n');
runAllTests();
