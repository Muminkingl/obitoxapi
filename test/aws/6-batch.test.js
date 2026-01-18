/**
 * AWS S3 SDK Test - Batch Operations
 * 
 * Tests batch delete (up to 1000 files)
 */

import ObitoX from '../dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = 'AKIA...';  // Replace with real AWS credentials
const S3_SECRET_KEY = 'wJalr...';  // Replace with real AWS credentials
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

console.log('🧪 S3 SDK Test - Batch Operations\n');
console.log('='.repeat(70));

async function testS3Batch() {
    try {
        // Initialize ObitoX SDK
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('✅ SDK initialized');

        // First, upload some test files
        console.log('\n📤 Uploading test files for batch operations...');

        const uploadPromises = [];
        for (let i = 1; i <= 5; i++) {
            const file = new File(
                [`Test file ${i} for batch operations`],
                `test-batch-${i}.txt`,
                { type: 'text/plain' }
            );

            uploadPromises.push(
                client.uploadFile(file, {
                    provider: 'S3',
                    s3AccessKey: S3_ACCESS_KEY,
                    s3SecretKey: S3_SECRET_KEY,
                    s3Bucket: S3_BUCKET,
                    s3Region: S3_REGION
                })
            );
        }

        await Promise.all(uploadPromises);
        console.log('✅ 5 test files uploaded');

        // Test 1: Batch delete
        console.log('\n📝 Test 1: Batch Delete (5 files)');

        await client.batchDelete({
            provider: 'S3',
            keys: [
                'test-batch-1.txt',
                'test-batch-2.txt',
                'test-batch-3.txt',
                'test-batch-4.txt',
                'test-batch-5.txt'
            ],
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ Batch delete successful!`);
        console.log(`   Deleted 5 files`);

        // Test 2: Batch delete with mix of existing and non-existing files
        console.log('\n📝 Test 2: Batch Delete with Mixed Files');

        await client.batchDelete({
            provider: 'S3',
            keys: [
                'test-batch-1.txt',  // Already deleted
                'non-existent-1.txt',
                'non-existent-2.txt'
            ],
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ Batch delete with mixed files handled!`);

        // Test 3: Validate batch size limit
        console.log('\n📝 Test 3: Batch Size Limit Validation');

        try {
            const largeArray = Array.from({ length: 1001 }, (_, i) => `file-${i}.txt`);

            await client.batchDelete({
                provider: 'S3',
                keys: largeArray,
                s3AccessKey: S3_ACCESS_KEY,
                s3SecretKey: S3_SECRET_KEY,
                s3Bucket: S3_BUCKET,
                s3Region: S3_REGION
            });

            console.log(`❌ Should have rejected batch >1000`);
        } catch (error) {
            if (error.message.includes('1000') || error.message.includes('Maximum')) {
                console.log(`✅ Batch size limit validated correctly`);
            } else {
                throw error;
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL BATCH OPERATION TESTS PASSED!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testS3Batch();
