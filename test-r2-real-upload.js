/**
 * R2 Real File Upload Test
 * Tests the complete upload workflow:
 * 1. Get signed URL from our API
 * 2. Upload actual file to R2 using signed URL
 * 3. Verify file exists in bucket
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const API_BASE = 'http://localhost:5500/api/v1/upload';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';

// R2 Credentials
const R2_CREDS = {
    accountId: 'b0cab7bc004505800b231cb8f9a793f4',
    accessKey: '67e3ba9f4da45799e5768e93de3ba4e8',
    secretKey: '0c578e0a7fa3c7f23affba1655b5345e7ef34fb1621238bd353b1b0f3eff1bbe',
    bucket: 'test'
};

console.log('🚀 R2 REAL FILE UPLOAD TEST\n');
console.log('='.repeat(80));

async function uploadRealFile() {
    try {
        // Step 1: Create a test file
        console.log('\n📝 STEP 1: Creating test file...');
        const testContent = `Hello from ObitoX R2 Upload Test!
Generated at: ${new Date().toISOString()}
This file was uploaded using our enterprise R2 API!

Performance metrics:
- Pure crypto signing (NO API calls)
- <20ms response time target
- Zero egress fees with Cloudflare R2

🎉 If you can read this, the upload worked perfectly!`;

        const testFilePath = join(__dirname, 'test-upload.txt');
        fs.writeFileSync(testFilePath, testContent);
        console.log(`   ✅ Created: ${testFilePath}`);
        console.log(`   📊 Size: ${testContent.length} bytes`);

        // Step 2: Get signed URL from our API
        console.log('\n🔗 STEP 2: Getting signed URL from API...');
        const signedUrlStart = Date.now();

        const signedUrlResponse = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                filename: 'test-upload.txt',
                contentType: 'text/plain',
                fileSize: testContent.length,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const signedUrlData = await signedUrlResponse.json();
        const signedUrlTime = Date.now() - signedUrlStart;

        if (!signedUrlData.success) {
            console.log('   ❌ Failed to get signed URL:', signedUrlData.message);
            return;
        }

        console.log(`   ✅ Got signed URL in ${signedUrlTime}ms`);
        console.log(`   ⚡ Server time: ${signedUrlData.performance?.totalTime}`);
        console.log(`   🔗 Upload URL: ${signedUrlData.uploadUrl.substring(0, 80)}...`);
        console.log(`   🌐 Public URL: ${signedUrlData.publicUrl}`);

        // Step 3: Upload file to R2 using signed URL
        console.log('\n📤 STEP 3: Uploading file to R2...');
        const uploadStart = Date.now();

        const fileBuffer = fs.readFileSync(testFilePath);

        const uploadResponse = await fetch(signedUrlData.uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': fileBuffer.length.toString()
            },
            body: fileBuffer
        });

        const uploadTime = Date.now() - uploadStart;

        if (uploadResponse.ok) {
            console.log(`   ✅ Upload successful in ${uploadTime}ms`);
            console.log(`   📊 Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
            console.log(`   🎯 ETag: ${uploadResponse.headers.get('etag')}`);
        } else {
            console.log(`   ❌ Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
            const errorText = await uploadResponse.text();
            console.log(`   Error: ${errorText}`);
            return;
        }

        // Step 4: Verify file exists in bucket
        console.log('\n🔍 STEP 4: Verifying file in bucket...');

        const listResponse = await fetch(`${API_BASE}/r2/list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const listData = await listResponse.json();

        if (listData.success) {
            console.log(`   ✅ Bucket contains ${listData.data.count} file(s)`);

            if (listData.data.files && listData.data.files.length > 0) {
                console.log(`\n   📁 Files in bucket:`);
                listData.data.files.forEach((file, i) => {
                    console.log(`      ${i + 1}. ${file.key}`);
                    console.log(`         Size: ${file.size} bytes`);
                    console.log(`         Modified: ${file.lastModified}`);
                });

                // Find our uploaded file
                const uploadedFile = listData.data.files.find(f =>
                    f.key.includes('test-upload') || f.size === testContent.length
                );

                if (uploadedFile) {
                    console.log(`\n   🎉 SUCCESS! Found our uploaded file:`);
                    console.log(`      Key: ${uploadedFile.key}`);
                    console.log(`      Size: ${uploadedFile.size} bytes`);
                }
            }
        }

        // Step 5: Summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 PERFORMANCE SUMMARY');
        console.log('='.repeat(80));
        console.log(`   Get Signed URL:    ${signedUrlTime}ms`);
        console.log(`   Server Processing: ${signedUrlData.performance?.totalTime || 'N/A'}`);
        console.log(`   Crypto Signing:    ${signedUrlData.performance?.breakdown?.cryptoSigning || 'N/A'}`);
        console.log(`   Upload to R2:      ${uploadTime}ms`);
        console.log(`   Total Time:        ${signedUrlTime + uploadTime}ms`);
        console.log('='.repeat(80));

        console.log('\n✅ COMPLETE! Your file is now in Cloudflare R2! 🎉');
        console.log(`   Public URL: ${signedUrlData.publicUrl}`);
        console.log(`   Note: Make bucket public in Cloudflare dashboard to access this URL\n`);

        // Cleanup
        fs.unlinkSync(testFilePath);
        console.log(`🧹 Cleaned up local test file`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run the test
uploadRealFile();
