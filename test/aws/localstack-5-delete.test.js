/**
 * LocalStack Test #5 - Delete File
 * 
 * Tests deleting a file from S3
 * 
 * Run: node test/aws/localstack-5-delete.test.js
 */

import { S3Client, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const TEST_BUCKET = 'obitox-test';
const TEST_REGION = 'us-east-1';

console.log('🧪 LocalStack Test #5 - DELETE FILE\n');
console.log('='.repeat(60));

async function testDelete() {
    try {
        const s3Client = new S3Client({
            region: TEST_REGION,
            endpoint: LOCALSTACK_ENDPOINT,
            forcePathStyle: true,
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
        });

        // Ensure bucket exists
        try {
            await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
        } catch (err) { /* ignore */ }

        const objectKey = `delete-test-${Date.now()}.txt`;

        // Step 1: Upload a file to delete
        console.log('\n📤 Step 1: Uploading a test file...');
        const putCommand = new PutObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey,
            ContentType: 'text/plain'
        });
        const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 60 });
        await fetch(uploadUrl, { method: 'PUT', body: 'File to be deleted' });
        console.log(`   ✅ Uploaded: ${objectKey}`);

        // Step 2: Verify file exists
        console.log('\n✔️  Step 2: Verifying file exists...');
        try {
            await s3Client.send(new HeadObjectCommand({
                Bucket: TEST_BUCKET,
                Key: objectKey
            }));
            console.log('   ✅ File exists');
        } catch (err) {
            throw new Error('File should exist but does not');
        }

        // Step 3: Delete the file
        console.log('\n🗑️  Step 3: Deleting file...');
        const deleteStart = Date.now();

        await s3Client.send(new DeleteObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey
        }));

        const deleteTime = Date.now() - deleteStart;
        console.log(`   ✅ Delete command sent`);
        console.log(`   ⏱️  Delete time: ${deleteTime}ms`);

        // Step 4: Verify file is deleted
        console.log('\n✔️  Step 4: Verifying file is deleted...');
        try {
            await s3Client.send(new HeadObjectCommand({
                Bucket: TEST_BUCKET,
                Key: objectKey
            }));
            throw new Error('File should be deleted but still exists!');
        } catch (err) {
            if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                console.log('   ✅ File successfully deleted (404 Not Found)');
            } else {
                throw err;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ DELETE TEST PASSED!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        process.exit(1);
    }
}

testDelete();
