/**
 * LocalStack Test #4 - Download File
 * 
 * Tests downloading a file using a presigned URL
 * 
 * Run: node test/aws/localstack-4-download.test.js
 */

import { S3Client, GetObjectCommand, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const TEST_BUCKET = 'obitox-test';
const TEST_REGION = 'us-east-1';

console.log('🧪 LocalStack Test #4 - FILE DOWNLOAD\n');
console.log('='.repeat(60));

async function testDownload() {
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

        // First, upload a file to download
        const objectKey = `download-test-${Date.now()}.txt`;
        const originalContent = `This is test content! Created at: ${new Date().toISOString()}`;

        console.log('\n📤 Step 1: Uploading a test file first...');
        const putCommand = new PutObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey,
            ContentType: 'text/plain'
        });
        const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 60 });
        await fetch(uploadUrl, { method: 'PUT', body: originalContent });
        console.log(`   ✅ Uploaded: ${objectKey}`);
        console.log(`   📄 Content: "${originalContent}"`);

        // Now generate download URL
        console.log('\n🔐 Step 2: Generating download signed URL...');
        const getCommand = new GetObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey
        });

        const signedUrlStart = Date.now();
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        const signedUrlTime = Date.now() - signedUrlStart;

        console.log(`   ✅ Download URL generated in ${signedUrlTime}ms`);
        console.log(`\n   📋 Download URL:`);
        console.log(`   ${downloadUrl}`);

        // Download the file
        console.log('\n📥 Step 3: Downloading file...');
        const downloadStart = Date.now();

        const response = await fetch(downloadUrl);
        const downloadedContent = await response.text();

        const downloadTime = Date.now() - downloadStart;

        if (response.ok) {
            console.log(`   ✅ DOWNLOAD SUCCESSFUL!`);
            console.log(`   ⏱️  Download time: ${downloadTime}ms`);
            console.log(`   📊 HTTP Status: ${response.status}`);
            console.log(`   📊 Content-Type: ${response.headers.get('content-type')}`);
            console.log(`   📊 Content-Length: ${response.headers.get('content-length')} bytes`);
            console.log(`\n   📄 Downloaded content:`);
            console.log(`   "${downloadedContent}"`);
        } else {
            throw new Error(`Download failed: ${response.status}`);
        }

        // Verify content matches
        console.log('\n✔️  Step 4: Verifying content...');
        if (downloadedContent === originalContent) {
            console.log('   ✅ Content matches! Download verified!');
        } else {
            console.log('   ❌ Content mismatch!');
            console.log(`   Expected: "${originalContent}"`);
            console.log(`   Got: "${downloadedContent}"`);
            throw new Error('Content verification failed');
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ DOWNLOAD TEST PASSED!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        process.exit(1);
    }
}

testDownload();
