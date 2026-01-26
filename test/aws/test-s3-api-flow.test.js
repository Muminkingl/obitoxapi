/**
 * S3 FULL API TEST (Like R2 Test)
 * 
 * Tests the COMPLETE flow:
 * 1. Client → ObitoX API Server → Get Signed URL
 * 2. Client → S3 (LocalStack) → Upload file
 * 
 * This verifies your controllers/providers/s3 code works!
 * 
 * REQUIRES:
 * - ObitoX API Server running (npm start)
 * - LocalStack running (docker start localstack)
 * 
 * Run: node test/aws/test-s3-api-flow.test.js
 */

import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const API_URL = 'http://localhost:5500';
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

// LocalStack S3 credentials (for testing)
// In production, these would be real AWS credentials
const S3_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const S3_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

// LocalStack endpoint - your API server needs to know about this for testing
// In production, this would be the real AWS endpoint

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
// TEST: S3 Upload via ObitoX API
// ============================================================================

async function testS3ViaAPI() {
    console.log('🎯 S3 FULL API FLOW TEST\n');
    console.log('='.repeat(70));
    console.log('Testing: Client → ObitoX API → S3 (LocalStack)');
    console.log('='.repeat(70));

    try {
        // Step 1: Request signed URL from ObitoX API
        console.log('\n📋 Step 1: Request Signed URL from ObitoX API');
        console.log('─'.repeat(70));

        const filename = `s3-api-test-${Date.now()}.txt`;
        const contentType = 'text/plain';
        const fileContent = `Hello S3 via ObitoX API! Tested at ${new Date().toISOString()}`;

        const body = {
            filename,
            contentType,
            fileSize: fileContent.length,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3StorageClass: 'STANDARD',
            s3EncryptionType: 'SSE-S3'
        };

        console.log(`   📁 Filename: ${filename}`);
        console.log(`   📊 Size: ${fileContent.length} bytes`);
        console.log(`   🌍 Region: ${S3_REGION}`);
        console.log(`   💾 Storage Class: STANDARD`);
        console.log(`   🔒 Encryption: SSE-S3`);

        const result = await makeRequest('POST', '/api/v1/upload/s3/signed-url', body);

        console.log(`\n   📊 API Response Status: ${result.status}`);

        if (result.status !== 200 || !result.data.success) {
            console.log('   ❌ Failed to get signed URL');
            console.log('   Error:', result.data.error || result.data.message);
            console.log('   Hint:', result.data.hint || 'N/A');

            // Check if API server is running
            if (result.status === 0 || result.data.error === 'ECONNREFUSED') {
                console.log('\n   💡 Is the API server running? Start with: npm start');
            }

            return false;
        }

        const { uploadUrl, publicUrl, uploadId, performance } = result.data;
        console.log('   ✅ Signed URL received from ObitoX API!');
        console.log(`   🔗 Upload URL: ${uploadUrl?.substring(0, 60)}...`);
        console.log(`   🌐 Public URL: ${publicUrl || 'N/A'}`);
        console.log(`   🆔 Upload ID: ${uploadId}`);
        if (performance) {
            console.log(`   ⏱️  API Performance: ${performance.totalTime}`);
        }

        // Step 2: Upload file directly to S3 using signed URL
        console.log('\n📋 Step 2: Upload File to S3 (using signed URL)');
        console.log('─'.repeat(70));

        const uploadStart = Date.now();
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType
            },
            body: fileContent
        });
        const uploadTime = Date.now() - uploadStart;

        if (!uploadResponse.ok) {
            console.log('   ❌ S3 upload failed');
            console.log(`   Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
            const errorText = await uploadResponse.text();
            console.log(`   Error: ${errorText.substring(0, 200)}`);
            return false;
        }

        console.log('   ✅ File uploaded successfully to S3!');
        console.log(`   ⏱️  Upload time: ${uploadTime}ms`);
        console.log(`   🔗 File URL: ${publicUrl}`);

        // Summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 RESULT: ✅ FULL API FLOW SUCCESSFUL!');
        console.log('═'.repeat(70));
        console.log('\n🎉 What was verified:');
        console.log('   ✅ API Key authentication');
        console.log('   ✅ Signature verification (Layer 2)');
        console.log('   ✅ S3 controller (s3.signed-url.js)');
        console.log('   ✅ S3 config validation (regions, storage classes)');
        console.log('   ✅ Signed URL generation');
        console.log('   ✅ Actual file upload to S3');
        console.log('\n🚀 Your S3 controller is working correctly!\n');

        return true;

    } catch (error) {
        console.log('\n❌ ERROR:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 The API server is not running!');
            console.log('   Start it with: npm start');
        }

        console.log(error.stack);
        return false;
    }
}

// Run the test
testS3ViaAPI();
