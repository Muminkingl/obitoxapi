/**
 * AWS S3 SDK Test - Delete
 * 
 * Tests single file deletion
 */

import ObitoX from '../dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = 'AKIA...';  // Replace with real AWS credentials
const S3_SECRET_KEY = 'wJalr...';  // Replace with real AWS credentials
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

console.log('🧪 S3 SDK Test - Delete\n');
console.log('='.repeat(70));

async function testS3Delete() {
    try {
        // Initialize ObitoX SDK
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('✅ SDK initialized');

        // First, upload a test file to delete
        console.log('\n📤 Uploading test file for deletion...');
        const testFile = new File(['Test file to delete'], 'test-delete.txt', { type: 'text/plain' });

        await client.uploadFile(testFile, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log('✅ Test file uploaded');

        // Test 1: Delete file
        console.log('\n📝 Test 1: Delete File');
        await client.deleteFile({
            provider: 'S3',
            key: 'test-delete.txt',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ File deleted successfully!`);

        // Test 2: Delete non-existent file (should handle gracefully)
        console.log('\n📝 Test 2: Delete Non-Existent File');
        try {
            await client.deleteFile({
                provider: 'S3',
                key: 'non-existent-file.txt',
                s3AccessKey: S3_ACCESS_KEY,
                s3SecretKey: S3_SECRET_KEY,
                s3Bucket: S3_BUCKET,
                s3Region: S3_REGION
            });
            console.log(`✅ Non-existent file deletion handled (might be 404 or success depending on S3 behavior)`);
        } catch (error) {
            if (error.message.includes('404') || error.message.includes('not found')) {
                console.log(`✅ 404 error handled correctly`);
            } else {
                throw error;
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL DELETE TESTS PASSED!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testS3Delete();
