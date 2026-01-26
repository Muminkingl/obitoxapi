/**
 * AWS S3 Test with LocalStack
 * 
 * This test uses LocalStack (running on Docker) as a real S3-compatible server.
 * 
 * LocalStack Endpoint: http://localhost:4566
 * 
 * Run: node test/aws/0-localstack.test.js
 */

import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// LocalStack configuration
const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const TEST_BUCKET = 'test-bucket';
const TEST_REGION = 'us-east-1';

// LocalStack accepts any credentials
const TEST_ACCESS_KEY = 'test';
const TEST_SECRET_KEY = 'test';

console.log('🧪 S3 LocalStack Test - REAL Upload & Download\n');
console.log('='.repeat(70));
console.log(`📍 LocalStack Endpoint: ${LOCALSTACK_ENDPOINT}`);
console.log('='.repeat(70));

async function testWithLocalStack() {
    try {
        // Create S3 client pointing to LocalStack
        const s3Client = new S3Client({
            region: TEST_REGION,
            endpoint: LOCALSTACK_ENDPOINT,
            forcePathStyle: true,  // Required for LocalStack
            credentials: {
                accessKeyId: TEST_ACCESS_KEY,
                secretAccessKey: TEST_SECRET_KEY
            }
        });

        console.log('\n✅ S3 Client created (pointing to LocalStack)');

        // Step 1: Create bucket
        console.log('\n📦 Step 1: Creating bucket...');
        try {
            await s3Client.send(new CreateBucketCommand({
                Bucket: TEST_BUCKET
            }));
            console.log(`   ✅ Bucket "${TEST_BUCKET}" created`);
        } catch (err) {
            if (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists') {
                console.log(`   ℹ️  Bucket "${TEST_BUCKET}" already exists`);
            } else {
                throw err;
            }
        }

        // Step 2: Generate Signed URL for upload
        console.log('\n🔐 Step 2: Generating Signed URL for upload...');
        const objectKey = `test-${Date.now()}.txt`;
        const signingStart = Date.now();

        const putCommand = new PutObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey,
            ContentType: 'text/plain'
        });

        const uploadUrl = await getSignedUrl(s3Client, putCommand, {
            expiresIn: 3600
        });

        const signingTime = Date.now() - signingStart;
        console.log(`   ✅ Signed URL generated in ${signingTime}ms`);
        console.log(`   📋 URL: ${uploadUrl.substring(0, 80)}...`);

        // Step 3: Actually upload a file using the signed URL
        console.log('\n📤 Step 3: Uploading file using signed URL...');
        const testContent = `Hello from LocalStack! Time: ${new Date().toISOString()}`;

        const uploadStart = Date.now();
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: testContent
        });

        const uploadTime = Date.now() - uploadStart;

        if (uploadResponse.ok) {
            console.log(`   ✅ Upload successful! Status: ${uploadResponse.status}`);
            console.log(`   ⏱️  Upload time: ${uploadTime}ms`);
        } else {
            throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        // Step 4: Generate Signed URL for download
        console.log('\n🔐 Step 4: Generating Signed URL for download...');
        const getCommand = new GetObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey
        });

        const downloadUrl = await getSignedUrl(s3Client, getCommand, {
            expiresIn: 3600
        });
        console.log(`   ✅ Download URL generated`);
        console.log(`   📋 URL: ${downloadUrl.substring(0, 80)}...`);

        // Step 5: Download the file
        console.log('\n📥 Step 5: Downloading file using signed URL...');
        const downloadStart = Date.now();
        const downloadResponse = await fetch(downloadUrl);
        const downloadedContent = await downloadResponse.text();
        const downloadTime = Date.now() - downloadStart;

        if (downloadResponse.ok) {
            console.log(`   ✅ Download successful! Status: ${downloadResponse.status}`);
            console.log(`   ⏱️  Download time: ${downloadTime}ms`);
            console.log(`   📄 Content: "${downloadedContent}"`);
        } else {
            throw new Error(`Download failed: ${downloadResponse.status}`);
        }

        // Step 6: Verify content matches
        console.log('\n✔️  Step 6: Verifying content...');
        if (downloadedContent === testContent) {
            console.log('   ✅ Content matches! Upload → Download verified!');
        } else {
            throw new Error('Content mismatch!');
        }

        // Step 7: List files in bucket
        console.log('\n📋 Step 7: Listing files in bucket...');
        const listResponse = await s3Client.send(new ListObjectsV2Command({
            Bucket: TEST_BUCKET
        }));

        console.log(`   ✅ Found ${listResponse.Contents?.length || 0} file(s):`);
        for (const obj of listResponse.Contents || []) {
            console.log(`      - ${obj.Key} (${obj.Size} bytes)`);
        }

        // Step 8: Delete the test file
        console.log('\n🗑️  Step 8: Cleaning up (deleting test file)...');
        await s3Client.send(new DeleteObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey
        }));
        console.log(`   ✅ File "${objectKey}" deleted`);

        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('🎉 ALL TESTS PASSED!');
        console.log('='.repeat(70));
        console.log('\n📊 Summary:');
        console.log(`   - Bucket creation: ✅`);
        console.log(`   - Signed URL generation: ✅ (${signingTime}ms)`);
        console.log(`   - File upload: ✅ (${uploadTime}ms)`);
        console.log(`   - File download: ✅ (${downloadTime}ms)`);
        console.log(`   - Content verification: ✅`);
        console.log(`   - File listing: ✅`);
        console.log(`   - File deletion: ✅`);
        console.log('\n✨ Your S3 signed URL implementation works correctly!');
        console.log('   It will work the same way with real AWS credentials.');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.error('\n💡 LocalStack is not running! Start it with:');
            console.error('   docker run -d -p 4566:4566 --name localstack localstack/localstack');
        }

        console.error('\nFull error:', error);
        process.exit(1);
    }
}

// Run the test
testWithLocalStack();
