/**
 * AWS S3 SDK Test - Download (Signed URL)
 * 
 * Tests generating presigned download URLs
 */

import ObitoX from '../dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = 'AKIA...';  // Replace with real AWS credentials
const S3_SECRET_KEY = 'wJalr...';  // Replace with real AWS credentials
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

console.log('🧪 S3 SDK Test - Download (Signed URL)\n');
console.log('='.repeat(70));

async function testS3Download() {
    try {
        // Initialize ObitoX SDK
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('✅ SDK initialized');

        // Note: These tests assume files already exist in S3
        const testFileKey = 'test-upload.txt';  // File uploaded in upload test

        // Test 1: Simple download URL
        console.log('\n📝 Test 1: Generate Download URL');
        const downloadUrl = await client.downloadFile({
            provider: 'S3',
            key: testFileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ Download URL generated!`);
        console.log(`   URL: ${downloadUrl.substring(0, 80)}...`);

        // Test 2: Download URL with expiration
        console.log('\n📝 Test 2: Download URL with Custom Expiration');
        const downloadUrl2 = await client.downloadFile({
            provider: 'S3',
            key: testFileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            expiresIn: 7200  // 2 hours
        });

        console.log(`✅ Download URL with expiration generated!`);
        console.log(`   Expires in: 7200 seconds (2 hours)`);

        // Test 3: Download URL with CloudFront
        console.log('\n📝 Test 3: Download URL with CloudFront CDN');
        const downloadUrl3 = await client.downloadFile({
            provider: 'S3',
            key: testFileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3CloudFrontDomain: 'cdn.example.com'
        });

        console.log(`✅ CloudFront download URL generated!`);
        console.log(`   URL: ${downloadUrl3.substring(0, 80)}...`);

        // Test 4: Download URL with response headers
        console.log('\n📝 Test 4: Download URL with Response Headers');
        const downloadUrl4 = await client.downloadFile({
            provider: 'S3',
            key: testFileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            responseContentType: 'text/plain',
            responseContentDisposition: 'attachment; filename="downloaded-file.txt"'
        });

        console.log(`✅ Download URL with custom headers generated!`);
        console.log(`   Content-Type: text/plain`);
        console.log(`   Content-Disposition: attachment`);

        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL DOWNLOAD TESTS PASSED!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testS3Download();
