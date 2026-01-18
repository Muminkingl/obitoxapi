/**
 * Test AWS S3 Integration (Using R2 Credentials)
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

async function testS3(region, storageClass) {
    console.log(`\n📝 Test: ${region} / ${storageClass}`);

    const { status, data } = await makeRequest('/api/v1/upload/s3/signed-url', {
        filename: 'test.txt',
        contentType: 'text/plain',
        s3AccessKey: S3_ACCESS_KEY,
        s3SecretKey: S3_SECRET_KEY,
        s3Bucket: S3_BUCKET,
        s3Region: region,
        s3StorageClass: storageClass
    });

    if (status === 200 && data.success) {
        console.log(`   ✅ SUCCESS!`);
        console.log(`   Region: ${data.region}`);
        console.log(`   Storage: ${data.storageClass}`);
        console.log(`   Encryption: ${data.encryption}`);
        console.log(`   Performance: ${data.performance?.totalTime}`);
    } else {
        console.log(`   ❌ FAILED: ${data.error} - ${data.message}`);
    }
}

console.log('🧪 Testing AWS S3 Integration\n');
await testS3('us-east-1', 'STANDARD');
await testS3('eu-west-1', 'STANDARD');
await testS3('us-east-1', 'STANDARD_IA');
await testS3('us-east-1', 'GLACIER_INSTANT_RETRIEVAL');
console.log('\n🎯 Tests Complete!');
