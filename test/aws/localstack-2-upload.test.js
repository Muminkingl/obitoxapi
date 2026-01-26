/**
 * LocalStack Test #2 - Upload File
 * 
 * Tests uploading a file using a presigned URL
 * 
 * Run: node test/aws/localstack-2-upload.test.js
 */

import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const TEST_BUCKET = 'obitox-test';
const TEST_REGION = 'us-east-1';

console.log('🧪 LocalStack Test #2 - FILE UPLOAD\n');
console.log('='.repeat(60));

async function testUpload() {
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
        } catch (err) { /* ignore if exists */ }

        const objectKey = `uploaded-file-${Date.now()}.txt`;
        const testContent = `Hello ObitoX! Uploaded at: ${new Date().toISOString()}`;

        // Step 1: Generate signed URL
        console.log('\n🔐 Step 1: Generating signed URL...');
        const command = new PutObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey,
            ContentType: 'text/plain'
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        console.log('   ✅ Signed URL ready');

        // Step 2: Upload using fetch
        console.log('\n📤 Step 2: Uploading file...');
        console.log(`   File: ${objectKey}`);
        console.log(`   Content: "${testContent}"`);
        console.log(`   Size: ${testContent.length} bytes`);

        const uploadStart = Date.now();

        const response = await fetch(signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
            body: testContent
        });

        const uploadTime = Date.now() - uploadStart;

        if (response.ok) {
            console.log('\n   ✅ UPLOAD SUCCESSFUL!');
            console.log(`   ⏱️  Upload time: ${uploadTime}ms`);
            console.log(`   📊 HTTP Status: ${response.status} ${response.statusText}`);

            // Show the public URL
            const publicUrl = `${LOCALSTACK_ENDPOINT}/${TEST_BUCKET}/${objectKey}`;
            console.log(`\n   📁 File stored at:`);
            console.log(`      ${publicUrl}`);
        } else {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ UPLOAD TEST PASSED!');
        console.log('='.repeat(60));
        console.log(`\n💡 File key for next tests: ${objectKey}`);

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        process.exit(1);
    }
}

testUpload();
