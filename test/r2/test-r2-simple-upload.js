/**
 * SIMPLE R2 UPLOAD TEST 
 * 
 * Tests ONLY upload to Cloudflare R2 via ObitoX API.
 * Uses Layer 2 signature authentication.
 */

import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const API_URL = 'http://localhost:5500';
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

// R2 Credentials
const R2_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const R2_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const R2_ACCOUNT_ID = 'b0cab7bc004505800b231cb8f9a793f4';
const R2_BUCKET = 'test';

// ============================================================================
// Signature Generation (Layer 2 Security)
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

// ============================================================================
// Make Authenticated Request
// ============================================================================

async function makeRequest(method, endpoint, body) {
    const signatureHeaders = generateSignature(method, endpoint, body);

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

    const data = await response.json();
    return { status: response.status, data };
}

// ============================================================================
// MAIN TEST: Upload Single File to R2
// ============================================================================

async function testR2Upload() {
    console.log('🎯 SIMPLE R2 UPLOAD TEST\n');
    console.log('='.repeat(60));

    try {
        // Step 1: Get signed URL from ObitoX API
        console.log('\n📋 Step 1: Request Signed URL from API');
        console.log('─'.repeat(60));

        const filename = `test-${Date.now()}.txt`;
        const contentType = 'text/plain';
        const fileContent = `Hello R2! Teskncdnsvkndvkndkjsvnjksdvnjkdsznvjknzsdkvnjkzsdkvnjkzsdnvkjsdnvnkjzdsnvjknsdzkjvnjkznsdt at ${new Date().toISOString()}`;

        const body = {
            filename,
            contentType,
            fileSize: fileContent.length,
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        };

        const result = await makeRequest('POST', '/api/v1/upload/r2/signed-url', body);

        if (result.status !== 200 || !result.data.success) {
            console.log('   ❌ Failed to get signed URL');
            console.log('   Error:', result.data.error || result.data.message);
            return false;
        }

        const { uploadUrl, publicUrl } = result.data;
        console.log('   ✅ Signed URL received!');
        console.log(`   📁 Filename: ${filename}`);
        console.log(`   🔗 Public URL: ${publicUrl}`);

        // Step 2: Upload file directly to R2
        console.log('\n📋 Step 2: Upload File to R2');
        console.log('─'.repeat(60));

        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType
            },
            body: fileContent
        });

        if (!uploadResponse.ok) {
            console.log('   ❌ R2 upload failed');
            console.log(`   Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
            return false;
        }

        console.log('   ✅ File uploaded successfully to R2!');
        console.log(`   🔗 File URL: ${publicUrl}`);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESULT: ✅ UPLOAD SUCCESSFUL!');
        console.log('='.repeat(60));
        console.log(`\n🎉 R2 Upload Test PASSED!\n`);

        return true;

    } catch (error) {
        console.log('\n❌ ERROR:', error.message);
        console.log(error.stack);
        return false;
    }
}

// Run the test
testR2Upload();
