/**
 * AWS S3 SDK Test - Upload (Signed URL)
 * 
 * Tests single file upload using presigned URLs
 */

import ObitoX from '../dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = 'AKIA...';  // Replace with real AWS credentials
const S3_SECRET_KEY = 'wJalr...';  // Replace with real AWS credentials
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

console.log('🧪 S3 SDK Test - Upload (Signed URL)\n');
console.log('='.repeat(70));

async function testS3Upload() {
    try {
        // Initialize ObitoX SDK
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('✅ SDK initialized');

        // Create a test file (Blob)
        const testContent = 'Hello from S3 SDK Test! ' + new Date().toISOString();
        const file = new File([testContent], 'test-upload.txt', { type: 'text/plain' });

        console.log(`\n📤 Uploading file: ${file.name} (${file.size} bytes)`);

        // Test 1: Simple upload
        console.log('\n📝 Test 1: Simple S3 Upload');
        const fileUrl = await client.uploadFile(file, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ Upload successful!`);
        console.log(`   File URL: ${fileUrl}`);

        // Test 2: Upload with storage class
        console.log('\n📝 Test 2: Upload with Storage Class');
        const file2 = new File(['Storage class test'], 'test-storage-class.txt', { type: 'text/plain' });

        const fileUrl2 = await client.uploadFile(file2, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3StorageClass: 'INTELLIGENT_TIERING'
        });

        console.log(`✅ Upload with storage class successful!`);
        console.log(`   File URL: ${fileUrl2}`);
        console.log(`   Storage Class: INTELLIGENT_TIERING`);

        // Test 3: Upload with encryption
        console.log('\n📝 Test 3: Upload with SSE-S3 Encryption');
        const file3 = new File(['Encrypted test'], 'test-encrypted.txt', { type: 'text/plain' });

        const fileUrl3 = await client.uploadFile(file3, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3EncryptionType: 'SSE-S3'
        });

        console.log(`✅ Upload with encryption successful!`);
        console.log(`   File URL: ${fileUrl3}`);
        console.log(`   Encryption: SSE-S3`);

        // Test 4: Upload with CloudFront
        console.log('\n📝 Test 4: Upload with CloudFront CDN');
        const file4 = new File(['CDN test'], 'test-cdn.txt', { type: 'text/plain' });

        const fileUrl4 = await client.uploadFile(file4, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3CloudFrontDomain: 'cdn.example.com'  // Optional
        });

        console.log(`✅ Upload with CloudFront successful!`);
        console.log(`   File URL: ${fileUrl4}`);

        // Test 5: Upload with all options
        console.log('\n📝 Test 5: Upload with All Options');
        const file5 = new File(['Full options test'], 'test-full.txt', { type: 'text/plain' });

        const fileUrl5 = await client.uploadFile(file5, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3StorageClass: 'STANDARD_IA',
            s3EncryptionType: 'SSE-S3',
            s3EnableVersioning: true,
            metadata: {
                'uploaded-by': 'sdk-test',
                'test-id': 'full-options'
            }
        });

        console.log(`✅ Upload with all options successful!`);
        console.log(`   File URL: ${fileUrl5}`);

        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL UPLOAD TESTS PASSED!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testS3Upload();
