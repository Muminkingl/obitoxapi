/**
 * AWS S3 SDK Test - Get Metadata
 * 
 * Tests getting file metadata without downloading
 */

import ObitoX from '../dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = 'AKIA...';  // Replace with real AWS credentials
const S3_SECRET_KEY = 'wJalr...';  // Replace with real AWS credentials
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

console.log('🧪 S3 SDK Test - Get Metadata\n');
console.log('='.repeat(70));

async function testS3Metadata() {
    try {
        // Initialize ObitoX SDK
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('✅ SDK initialized');

        // Note: Assumes test file exists in bucket
        const testFileKey = 'test-upload.txt';

        // Test 1: Get file metadata
        console.log('\n📝 Test 1: Get File Metadata');
        const metadata = await client.getMetadata({
            provider: 'S3',
            key: testFileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ Metadata retrieved successfully!`);
        console.log(`\n   File Information:`);
        console.log(`   Key: ${metadata.metadata.key}`);
        console.log(`   Size: ${metadata.metadata.sizeFormatted} (${metadata.metadata.size} bytes)`);
        console.log(`   Type: ${metadata.metadata.contentType}`);
        console.log(`   Last Modified: ${metadata.metadata.lastModified}`);
        console.log(`   Storage Class: ${metadata.metadata.storageClass}`);
        console.log(`   Encryption: ${metadata.metadata.encryption.serverSideEncryption}`);

        if (metadata.metadata.versionId) {
            console.log(`   Version ID: ${metadata.metadata.versionId}`);
        }

        if (Object.keys(metadata.metadata.customMetadata).length > 0) {
            console.log(`   Custom Metadata: ${JSON.stringify(metadata.metadata.customMetadata)}`);
        }

        console.log(`\n   Performance Benefits:`);
        console.log(`   ${metadata.savings.dataTransfer}`);
        console.log(`   ${metadata.savings.speedImprovement}`);

        // Test 2: Get metadata for non-existent file
        console.log('\n📝 Test 2: Get Metadata for Non-Existent File');
        try {
            await client.getMetadata({
                provider: 'S3',
                key: 'non-existent-file.txt',
                s3AccessKey: S3_ACCESS_KEY,
                s3SecretKey: S3_SECRET_KEY,
                s3Bucket: S3_BUCKET,
                s3Region: S3_REGION
            });
            console.log(`⚠️  Unexpected success (file might exist)`);
        } catch (error) {
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log(`✅ 404 error handled correctly`);
            } else {
                throw error;
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL METADATA TESTS PASSED!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testS3Metadata();
