/**
 * Test AWS S3 Phase 2A - All Regions & Storage Classes
 */

import crypto from 'crypto';

const API_URL = 'http://localhost:5500';
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const S3_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const S3_BUCKET = 'test';

// Generate signature: METHOD|PATH|TIMESTAMP|BODY
function generateSignature(endpoint, body) {
    const timestamp = Date.now();
    const method = 'POST';
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

async function testRegion(region) {
    const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
        filename: 'test.txt',
        contentType: 'text/plain',
        s3AccessKey: S3_ACCESS_KEY,
        s3SecretKey: S3_SECRET_KEY,
        s3Bucket: S3_BUCKET,
        s3Region: region,
        s3StorageClass: 'STANDARD'
    });

    return status === 200 && data.success && data.region === region;
}

async function testStorageClass(storageClass) {
    const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
        filename: 'test.txt',
        contentType: 'text/plain',
        s3AccessKey: S3_ACCESS_KEY,
        s3SecretKey: S3_SECRET_KEY,
        s3Bucket: S3_BUCKET,
        s3Region: 'us-east-1',
        s3StorageClass: storageClass
    });

    return status === 200 && data.success && data.storageClass === storageClass;
}

console.log('🧪 Testing AWS S3 Phase 2A - All Regions & Storage Classes\n');
console.log('='.repeat(70));

// Test all 18 regions
console.log('\n📍 Testing All 18 Regions:\n');

const allRegions = [
    // Phase 1 (8 regions)
    'us-east-1', 'us-west-2', 'ca-central-1',
    'eu-west-1', 'eu-central-1',
    'ap-south-1', 'ap-southeast-1', 'ap-northeast-1',
    // Phase 2 (10 more regions)
    'us-east-2', 'us-west-1',
    'eu-west-2', 'eu-west-3', 'eu-north-1',
    'ap-northeast-2', 'ap-southeast-2',
    'me-south-1', 'sa-east-1', 'af-south-1'
];

let successRegions = 0;
for (const region of allRegions) {
    const success = await testRegion(region);
    if (success) {
        console.log(`   ✅ ${region}: SUCCESS`);
        successRegions++;
    } else {
        console.log(`   ❌ ${region}: FAILED`);
    }
}

console.log(`\n📊 Region Results: ${successRegions}/${allRegions.length} regions working`);
console.log('='.repeat(70));

// Test all 7 storage classes
console.log('\n💾 Testing All 7 Storage Classes:\n');

const allStorageClasses = [
    // Phase 1 (3 classes)
    'STANDARD', 'STANDARD_IA', 'GLACIER_INSTANT_RETRIEVAL',
    // Phase 2 (4 more classes)
    'ONEZONE_IA', 'GLACIER_FLEXIBLE_RETRIEVAL',
    'GLACIER_DEEP_ARCHIVE', 'INTELLIGENT_TIERING'
];

let successClasses = 0;
for (const storageClass of allStorageClasses) {
    const success = await testStorageClass(storageClass);
    if (success) {
        console.log(`   ✅ ${storageClass}: SUCCESS`);
        successClasses++;
    } else {
        console.log(`   ❌ ${storageClass}: FAILED`);
    }
}

console.log(`\n📊 Storage Class Results: ${successClasses}/${allStorageClasses.length} classes working`);
console.log('='.repeat(70));

// Summary
console.log('\n🎯 Phase 2A Summary:\n');
if (successRegions === allRegions.length && successClasses === allStorageClasses.length) {
    console.log('   ✅ ALL TESTS PASSED!');
    console.log(`   ✅ ${successRegions} regions working`);
    console.log(`   ✅ ${successClasses} storage classes working`);
    console.log('\n   🚀 Phase 2A COMPLETE - Ready for Phase 2B (CloudFront)!');
} else {
    console.log(`   ⚠️  Some tests failed:`);
    console.log(`   Regions: ${successRegions}/${allRegions.length}`);
    console.log(`   Storage Classes: ${successClasses}/${allStorageClasses.length}`);
}

console.log('\n' + '='.repeat(70));
