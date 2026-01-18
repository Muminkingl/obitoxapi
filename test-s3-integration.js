/**
 * Test AWS S3 Integration (Using R2 Credentials)
 * 
 * Since S3 implementation uses ZERO network calls (pure crypto signing),
 * we can test it with R2 credentials! The AWS SDK v3 signing works the same.
 * 
 * What we're testing:
 * ✅ S3 endpoint accepts requests
 * ✅ Region validation works
 * ✅ Storage class validation works
 * ✅ Presigned URL generation works
 * ✅ Response includes S3-specific fields
 * ✅ Performance <15ms
 */

import crypto from 'crypto';

// ============================================================================
// Test Configuration
// ============================================================================

const API_URL = 'http://localhost:5500';

// Real credentials from user
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';

// R2 credentials (S3-compatible!)
const S3_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const S3_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const S3_BUCKET = 'test'; // User's R2 bucket name

// ============================================================================
// Signature Generation (Layer 2 Security)
// ============================================================================

function generateSignature(body) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');

    const payload = JSON.stringify(body);
    const message = `${timestamp}.${nonce}.${payload}`;

    const signature = crypto
        .createHmac('sha256', API_SECRET)
        .update(message)
        .digest('hex');

    return {
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString(),
        'X-Nonce': nonce
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

    return {
        status: response.status,
        data
    };
}

// ============================================================================
// Test Functions
// ============================================================================

async function testS3SignedUrl(region, storageClass) {
    console.log(`\n📝 Test: S3 Signed URL (region: ${region}, storage: ${storageClass})`);
    console.log('   Expected: 200 OK, presigned URL generated\n');

    const requestBody = {
        filename: 'test-s3.txt',
        contentType: 'text/plain',
        s3AccessKey: S3_ACCESS_KEY,
        s3SecretKey: S3_SECRET_KEY,
        s3Bucket: S3_BUCKET,
        s3Region: region,
        s3StorageClass: storageClass
    };

    const startTime = Date.now();
    const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', requestBody);
    const responseTime = Date.now() - startTime;

    console.log(`   Status: ${status}`);
    console.log(`   Response Time: ${responseTime}ms`);
    console.log(`   Success: ${data.success}`);

    if (data.success) {
        console.log(`   ✅ S3 signed URL generated!`);
        console.log(`   Upload ID: ${data.uploadId}`);
        console.log(`   Provider: ${data.provider}`);
        console.log(`   Region: ${data.region}`);
        console.log(`   Storage Class: ${data.storageClass}`);
        console.log(`   Encryption: ${data.encryption}`);
        console.log(`   Upload URL: ${data.uploadUrl.substring(0, 100)}...`);
        console.log(`   Public URL: ${data.publicUrl}`);
        console.log(`   Performance: ${data.performance.totalTime}`);

        // Verify S3-specific fields
        if (data.region === region) {
            console.log(`   ✅ Region matches: ${region}`);
        }
        if (data.storageClass === storageClass) {
            console.log(`   ✅ Storage class matches: ${storageClass}`);
        }
        if (data.encryption) {
            console.log(`   ✅ Encryption enabled: ${data.encryption}`);
        }

        // Performance check
        if (responseTime < 15) {
            console.log(`   ✅ Performance excellent: ${responseTime}ms < 15ms target`);
        } else if (responseTime < 50) {
            console.log(`   ⚠️  Performance acceptable: ${responseTime}ms`);
        } else {
            console.log(`   ❌ Performance slow: ${responseTime}ms > 50ms`);
        }
    } else {
        console.log(`   ❌ Request failed: ${data.error}`);
        console.log(`   Message: ${data.message}`);
        if (data.hint) console.log(`   Hint: ${data.hint}`);
    }

    console.log('');
    console.log('='.repeat(80));

    return data;
}

async function testInvalidRegion() {
    console.log(`\n📝 Test: Invalid Region Validation`);
    console.log('   Expected: 400 error with region validation message\n');

    const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
        filename: 'test.txt',
        contentType: 'text/plain',
        s3AccessKey: S3_ACCESS_KEY,
        s3SecretKey: S3_SECRET_KEY,
        s3Bucket: S3_BUCKET,
        s3Region: 'invalid-region',
        s3StorageClass: 'STANDARD'
    });

    console.log(`   Status: ${status}`);

    if (status === 400 && data.error === 'INVALID_S3_REGION') {
        console.log(`   ✅ Region validation works!`);
        console.log(`   Error: ${data.error}`);
        console.log(`   Message: ${data.message}`);
    } else {
        console.log(`   ❌ Expected 400 INVALID_S3_REGION error`);
    }

    console.log('');
    console.log('='.repeat(80));
}

async function testInvalidStorageClass() {
    console.log(`\n📝 Test: Invalid Storage Class Validation`);
    console.log('   Expected: 400 error with storage class validation message\n');

    const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
        filename: 'test.txt',
        contentType: 'text/plain',
        s3AccessKey: S3_ACCESS_KEY,
        s3SecretKey: S3_SECRET_KEY,
        s3Bucket: S3_BUCKET,
        s3Region: 'us-east-1',
        s3StorageClass: 'INVALID_CLASS'
    });

    console.log(`   Status: ${status}`);

    if (status === 400 && data.error === 'INVALID_STORAGE_CLASS') {
        console.log(`   ✅ Storage class validation works!`);
        console.log(`   Error: ${data.error}`);
        console.log(`   Message: ${data.message}`);
    } else {
        console.log(`   ❌ Expected 400 INVALID_STORAGE_CLASS error`);
    }

    console.log('');
    console.log('='.repeat(80));
}

async function testAllRegions() {
    console.log(`\n📝 Test: All 8 Supported Regions`);
    console.log('   Expected: All regions work\n');

    const regions = [
        'us-east-1',
        'us-west-2',
        'ca-central-1',
        'eu-west-1',
        'eu-central-1',
        'ap-south-1',
        'ap-southeast-1',
        'ap-northeast-1'
    ];

    let successCount = 0;

    for (const region of regions) {
        const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
            filename: 'test.txt',
            contentType: 'text/plain',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: region,
            s3StorageClass: 'STANDARD'
        });

        if (status === 200 && data.success && data.region === region) {
            console.log(`   ✅ ${region}: SUCCESS`);
            successCount++;
        } else {
            console.log(`   ❌ ${region}: FAILED`);
        }
    }

    console.log(`\n   Result: ${successCount}/${regions.length} regions working`);
    console.log('');
    console.log('='.repeat(80));
}

async function testAllStorageClasses() {
    console.log(`\n📝 Test: All 3 Supported Storage Classes`);
    console.log('   Expected: All storage classes work\n');

    const storageClasses = [
        'STANDARD',
        'STANDARD_IA',
        'GLACIER_INSTANT_RETRIEVAL'
    ];

    let successCount = 0;

    for (const storageClass of storageClasses) {
        const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
            filename: 'test.txt',
            contentType: 'text/plain',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: 'us-east-1',
            s3StorageClass: storageClass
        });

        if (status === 200 && data.success && data.storageClass === storageClass) {
            console.log(`   ✅ ${storageClass}: SUCCESS`);
            successCount++;
        } else {
            console.log(`   ❌ ${storageClass}: FAILED`);
        }
    }

    console.log(`\n   Result: ${successCount}/${storageClasses.length} storage classes working`);
    console.log('');
    console.log('='.repeat(80));
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runAllTests() {
    console.log('🧪 Testing AWS S3 Integration (with R2 credentials)\n');
    console.log('✅ Using Layer 2 Security (API Key + Secret + Signature)\n');
    console.log('='.repeat(80));

    try {
        // Test 1: Basic S3 signed URL (us-east-1, STANDARD)
        await testS3SignedUrl('us-east-1', 'STANDARD');

        // Test 2: Different region
        await testS3SignedUrl('eu-west-1', 'STANDARD');

        // Test 3: Different storage class
        await testS3SignedUrl('us-east-1', 'STANDARD_IA');

        // Test 4: Glacier storage
        await testS3SignedUrl('us-east-1', 'GLACIER_INSTANT_RETRIEVAL');

        // Test 5: Invalid region validation
        await testInvalidRegion();

        // Test 6: Invalid storage class validation
        await testInvalidStorageClass();

        // Test 7: All regions
        await testAllRegions();

        // Test 8: All storage classes
        await testAllStorageClasses();

        console.log('\n🎯 Test Complete!');
        console.log('\n✅ If all tests passed, S3 integration is working perfectly!');
        console.log('✅ Presigned URLs are being generated with region + storage class support');
        console.log('✅ Performance should be <15ms (pure crypto signing)');

    } catch (error) {
        console.error('\n❌ Test failed with error:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run tests
runAllTests();
