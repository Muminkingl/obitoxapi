/**
 * AWS S3 SDK Test - List Files
 * 
 * Tests file listing with pagination
 */

import ObitoX from '../dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const S3_ACCESS_KEY = 'AKIA...';  // Replace with real AWS credentials
const S3_SECRET_KEY = 'wJalr...';  // Replace with real AWS credentials
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';

console.log('🧪 S3 SDK Test - List Files\n');
console.log('='.repeat(70));

async function testS3List() {
    try {
        // Initialize ObitoX SDK
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('✅ SDK initialized');

        // Note: Assuming bucket has some files already

        // Test 1: List all files
        console.log('\n📝 Test 1: List All Files');
        const listResult = await client.listFiles({
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION
        });

        console.log(`✅ Files listed successfully!`);
        console.log(`   File count: ${listResult.count}`);
        console.log(`   Truncated: ${listResult.isTruncated}`);

        if (listResult.files.length > 0) {
            console.log(`\n   First 3 files:`);
            listResult.files.slice(0, 3).forEach((file, i) => {
                console.log(`     ${i + 1}. ${file.key} (${file.size} bytes)`);
            });
        }

        // Test 2: List with prefix
        console.log('\n📝 Test 2: List Files with Prefix');
        const listResult2 = await client.listFiles({
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            prefix: 'test-'  // Filter by prefix
        });

        console.log(`✅ Files with prefix listed!`);
        console.log(`   File count: ${listResult2.count}`);
        console.log(`   Prefix: test-`);

        // Test 3: List with max keys
        console.log('\n📝 Test 3: List Files with Max Keys Limit');
        const listResult3 = await client.listFiles({
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            maxKeys: 10  // Limit to 10 files
        });

        console.log(`✅ Files with limit listed!`);
        console.log(`   File count: ${listResult3.count}`);
        console.log(`   Max keys: 10`);
        console.log(`   Truncated: ${listResult3.isTruncated}`);

        if (listResult3.isTruncated && listResult3.nextContinuationToken) {
            console.log(`   Next continuation token available for pagination`);
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL LIST TESTS PASSED!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run tests
testS3List();
