/**
 * LocalStack Test #1 - Signed URL Generation
 * 
 * Tests ONLY the signed URL generation (pure crypto, no upload)
 * 
 * Run: node test/aws/localstack-1-signed-url.test.js
 */

import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// LocalStack configuration
const LOCALSTACK_ENDPOINT = 'http://localhost:4566';
const TEST_BUCKET = 'obitox-test';
const TEST_REGION = 'us-east-1';

console.log('🧪 LocalStack Test #1 - SIGNED URL GENERATION\n');
console.log('='.repeat(60));

async function testSignedUrl() {
    try {
        // Create S3 client
        console.log('\n📦 Creating S3 Client...');
        const s3Client = new S3Client({
            region: TEST_REGION,
            endpoint: LOCALSTACK_ENDPOINT,
            forcePathStyle: true,
            credentials: {
                accessKeyId: 'test',
                secretAccessKey: 'test'
            }
        });
        console.log('   ✅ Client created');

        // Create bucket (if not exists)
        console.log('\n📦 Creating bucket...');
        try {
            await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
            console.log(`   ✅ Bucket "${TEST_BUCKET}" created`);
        } catch (err) {
            if (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists') {
                console.log(`   ℹ️  Bucket already exists`);
            } else throw err;
        }

        // Generate signed URL
        console.log('\n🔐 Generating Signed URL...');
        const objectKey = `test-file-${Date.now()}.txt`;

        const startTime = Date.now();

        const command = new PutObjectCommand({
            Bucket: TEST_BUCKET,
            Key: objectKey,
            ContentType: 'text/plain'
        });

        const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600  // 1 hour
        });

        const signingTime = Date.now() - startTime;

        console.log('   ✅ Signed URL generated!');
        console.log(`   ⏱️  Time: ${signingTime}ms`);

        // Parse and display URL components
        const url = new URL(signedUrl);
        console.log('\n📋 URL Components:');
        console.log(`   Protocol: ${url.protocol}`);
        console.log(`   Host: ${url.hostname}`);
        console.log(`   Port: ${url.port}`);
        console.log(`   Path: ${url.pathname}`);

        console.log('\n🔑 Signature Parameters:');
        console.log(`   X-Amz-Algorithm: ${url.searchParams.get('X-Amz-Algorithm')}`);
        console.log(`   X-Amz-Credential: ${url.searchParams.get('X-Amz-Credential')?.substring(0, 30)}...`);
        console.log(`   X-Amz-Date: ${url.searchParams.get('X-Amz-Date')}`);
        console.log(`   X-Amz-Expires: ${url.searchParams.get('X-Amz-Expires')} seconds`);
        console.log(`   X-Amz-Signature: ${url.searchParams.get('X-Amz-Signature')?.substring(0, 20)}...`);
        console.log(`   X-Amz-SignedHeaders: ${url.searchParams.get('X-Amz-SignedHeaders')}`);

        console.log('\n📝 Full Signed URL:');
        console.log(`   ${signedUrl}`);

        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST PASSED! Signed URL generated successfully.');
        console.log('='.repeat(60));

        // Save for next test
        console.log('\n💡 Copy this URL to test upload in the next step!');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.message.includes('ECONNREFUSED')) {
            console.error('\n💡 Start LocalStack: docker start localstack');
        }
        process.exit(1);
    }
}

testSignedUrl();
