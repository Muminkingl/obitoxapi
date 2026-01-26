/**
 * LocalStack Test #3 - List Files
 * 
 * Tests listing files in a bucket
 * 
 * Run: node test/aws/localstack-3-list.test.js
 */

import { S3Client, ListObjectsV2Command, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const TEST_BUCKET = 'obitox-test';
const TEST_REGION = 'us-east-1';

console.log('🧪 LocalStack Test #3 - LIST FILES\n');
console.log('='.repeat(60));

async function testList() {
    try {
        const s3Client = new S3Client({
            region: TEST_REGION,
            endpoint: LOCALSTACK_ENDPOINT,
            forcePathStyle: true,
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
        });

        // Ensure bucket exists and has some files
        try {
            await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
        } catch (err) { /* ignore */ }

        // Upload a few test files first
        console.log('\n📤 Uploading test files...');
        for (let i = 1; i <= 3; i++) {
            const key = `list-test-${i}-${Date.now()}.txt`;
            const command = new PutObjectCommand({
                Bucket: TEST_BUCKET,
                Key: key,
                ContentType: 'text/plain'
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 60 });
            await fetch(url, { method: 'PUT', body: `Test file ${i}` });
            console.log(`   ✅ Uploaded: ${key}`);
        }

        // List files
        console.log('\n📋 Listing files in bucket...');
        const listStart = Date.now();

        const response = await s3Client.send(new ListObjectsV2Command({
            Bucket: TEST_BUCKET,
            MaxKeys: 100
        }));

        const listTime = Date.now() - listStart;

        console.log(`\n   ⏱️  List time: ${listTime}ms`);
        console.log(`   📊 Total files: ${response.KeyCount || 0}`);
        console.log(`   📊 Is truncated: ${response.IsTruncated || false}`);

        if (response.Contents && response.Contents.length > 0) {
            console.log('\n   📁 Files:');
            console.log('   ' + '-'.repeat(50));

            for (const obj of response.Contents) {
                const size = obj.Size || 0;
                const lastMod = obj.LastModified ? obj.LastModified.toISOString() : 'N/A';
                console.log(`   📄 ${obj.Key}`);
                console.log(`      Size: ${size} bytes | Modified: ${lastMod}`);
            }
        } else {
            console.log('\n   ⚠️  Bucket is empty');
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ LIST TEST PASSED!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        process.exit(1);
    }
}

testList();
