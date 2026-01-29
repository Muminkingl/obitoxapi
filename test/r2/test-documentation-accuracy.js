/**
 * R2 DOCUMENTATION VALIDATION TEST
 * 
 * Tests EVERY code example from wwwwwwwR2.md to ensure 100% accuracy
 * Published documentation MUST work exactly as shown!
 * 
 * Credentials:
 * - API Key: ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a
 * - API Secret: sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9
 * - R2 Access Key: 8105c2c257b314edbc01fa0667cac2da
 * - R2 Secret Key: 23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31
 * - R2 Account ID: b0cab7bc004505800b231cb8f9a793f4
 * - R2 Bucket: test
 */

import ObitoX from '../../dist/index.esm.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CREDENTIALS (from documentation)
// ============================================================================

const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';
const R2_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const R2_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const R2_ACCOUNT_ID = 'b0cab7bc004505800b231cb8f9a793f4';
const R2_BUCKET = 'test';

// ============================================================================
// TEST DATA
// ============================================================================

const testFiles = {
    image: path.join(__dirname, '../test-files/test-image.jpg'),
    pdf: path.join(__dirname, '../test-files/test-pdf.pdf')
};

// Store uploaded URLs for cleanup
const uploadedUrls = [];
const uploadedKeys = [];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTestFile(filePath, size = 1024) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = Buffer.alloc(size);
    buffer.fill('A');
    fs.writeFileSync(filePath, buffer);
}

function testPassed(testName) {
    console.log(`✅ PASS: ${testName}`);
}

function testFailed(testName, error) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(`   Error: ${error.message}`);
    throw error;  // Stop on first failure
}

// ============================================================================
// TEST 1: Upload First File (from docs)
// ============================================================================

async function test1_UploadFirstFile() {
    console.log('\n📝 TEST 1: Upload First File (exactly as documented)');
    console.log('---------------------------------------------------');

    try {
        // Create test file
        createTestFile(testFiles.image, 5000);
        const fileBuffer = fs.readFileSync(testFiles.image);
        const file = new File([fileBuffer], 'test-photo.jpg', { type: 'image/jpeg' });

        // EXACT CODE FROM DOCUMENTATION
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const url = await client.uploadFile(file, {
            provider: 'R2',
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        console.log('Uploaded:', url);

        // Validate
        if (!url || !url.includes('.r2.dev')) {
            throw new Error('Invalid R2 URL returned');
        }

        uploadedUrls.push(url);
        // Extract key from URL for cleanup
        const urlObj = new URL(url);
        uploadedKeys.push(urlObj.pathname.split('/').pop());

        testPassed('Upload first file - code works exactly as documented');

        return url;

    } catch (error) {
        testFailed('Upload first file', error);
    }
}

// ============================================================================
// TEST 2: Batch Upload (from docs)
// ============================================================================

async function test2_BatchUpload() {
    console.log('\n📝 TEST 2: Batch Upload (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const r2Provider = client.providers.get('R2');

        // EXACT CODE FROM DOCUMENTATION
        // Step 1: Get signed URLs for all files at once
        const result = await r2Provider.batchUpload({
            files: [
                { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024 },
                { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 1024 },
                { filename: 'photo3.jpg', contentType: 'image/jpeg', fileSize: 1024 }
            ],
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });
        // EXACT CODE FROM DOCUMENTATION
        console.log(`Generated ${result.total} URLs in ${result.performance.totalTime}`);
        // Output: Generated 3 URLs in 12ms

        // Validate - docs expect result.urls
        if (!result.urls || result.urls.length !== 3) {
            throw new Error(`Expected 3 URLs, got ${result.urls?.length || 0}`);
        }

        // Step 2: Upload files using the URLs (exactly as docs show)
        console.log('   Uploading files using signed URLs...');
        const testBuffer = Buffer.alloc(1024).fill('A');

        for (let i = 0; i < result.urls.length; i++) {
            const uploadUrl = result.urls[i].uploadUrl;
            await fetch(uploadUrl, {
                method: 'PUT',
                body: testBuffer,
                headers: { 'Content-Type': 'image/jpeg' }
            });
            // Store the filename for cleanup
            uploadedKeys.push(result.urls[i].filename);
            console.log(`   ✅ Uploaded ${result.urls[i].filename}`);
        }

        testPassed('Batch upload - code works exactly as documented');

        return result;

    } catch (error) {
        testFailed('Batch upload', error);
    }
}

// ============================================================================
// TEST 3: Single Delete (from docs)
// ============================================================================

async function test3_SingleDelete() {
    console.log('\n📝 TEST 3: Single Delete (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Upload a file first
        const fileBuffer = fs.readFileSync(testFiles.image);
        const file = new File([fileBuffer], 'delete-test.jpg', { type: 'image/jpeg' });

        const url = await client.uploadFile(file, {
            provider: 'R2',
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        const urlObj = new URL(url);
        const key = urlObj.pathname.split('/').pop();

        console.log(`   Uploaded: ${url}`);

        // EXACT CODE FROM DOCUMENTATION
        await client.deleteFile({
            provider: 'R2',
            fileUrl: url,
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        console.log('✅ Deleted!');

        testPassed('Single delete - code works exactly as documented');

    } catch (error) {
        testFailed('Single delete', error);
    }
}

// ============================================================================
// TEST 4: Batch Delete (from docs)
// ============================================================================

async function test4_BatchDelete() {
    console.log('\n📝 TEST 4: Batch Delete (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const r2Provider = client.providers.get('R2');

        // Upload 3 files first using batchUpload
        console.log('   Uploading 3 test files...');
        const batchResult = await r2Provider.batchUpload({
            files: [
                { filename: 'del1.jpg', contentType: 'image/jpeg', fileSize: 1024 },
                { filename: 'del2.jpg', contentType: 'image/jpeg', fileSize: 1024 },
                { filename: 'del3.jpg', contentType: 'image/jpeg', fileSize: 1024 }
            ],
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        // Actually upload via signed URLs
        const testBuffer = Buffer.alloc(1024).fill('B');
        const fileKeys = [];

        // Use urls as documented (SDK now transforms to urls)
        for (const urlInfo of batchResult.urls) {
            await fetch(urlInfo.uploadUrl, {
                method: 'PUT',
                body: testBuffer,
                headers: { 'Content-Type': 'image/jpeg' }
            });
            // Extract key from publicUrl
            const urlObj = new URL(urlInfo.publicUrl);
            const key = urlObj.pathname.slice(1); // Remove leading /
            fileKeys.push(key);
            console.log(`   ✅ Uploaded: ${key}`);
        }

        console.log(`   Uploaded ${fileKeys.length} files`);

        // EXACT CODE FROM DOCUMENTATION
        const result = await r2Provider.batchDelete({
            fileKeys: fileKeys,
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        console.log(`✅ Deleted: ${result.deleted.length}`);

        testPassed('Batch delete - code works exactly as documented');

    } catch (error) {
        testFailed('Batch delete', error);
    }
}

// ============================================================================
// TEST 5: Download with Signed URL (from docs)
// ============================================================================

async function test5_DownloadSignedUrl() {
    console.log('\n📝 TEST 5: Download with Signed URL (exactly as documented)');
    console.log('-----------------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Upload a file first
        const fileBuffer = fs.readFileSync(testFiles.image);
        const file = new File([fileBuffer], 'download-test.jpg', { type: 'image/jpeg' });

        const url = await client.uploadFile(file, {
            provider: 'R2',
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        const urlObj = new URL(url);
        const key = urlObj.pathname.split('/').pop();

        console.log(`   Uploaded: ${key}`);

        // EXACT CODE FROM DOCUMENTATION
        const downloadUrl = await client.downloadFile({
            provider: 'R2',
            fileKey: key,
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET,
            expiresIn: 3600
        });

        // EXACT CODE FROM DOCUMENTATION 
        console.log(downloadUrl);  // SDK now returns string directly

        // Validate signed URL works
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        const downloadedSize = (await response.blob()).size;
        console.log(`   ✅ Downloaded ${downloadedSize} bytes`);

        // Cleanup
        await client.deleteFile({
            provider: 'R2',
            fileUrl: url,
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        testPassed('Download signed URL - code works exactly as documented');

    } catch (error) {
        testFailed('Download signed URL', error);
    }
}

// ============================================================================
// TEST 6: List Files (from docs)
// ============================================================================

async function test6_ListFiles() {
    console.log('\n📝 TEST 6: List Files (exactly as documented)');
    console.log('----------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const r2Provider = client.providers.get('R2');

        // EXACT CODE FROM DOCUMENTATION
        const result = await r2Provider.listFiles({
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET,
            maxKeys: 100
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log(`Found ${result.count} files`);

        // Validate - result.count should be a number now
        if (typeof result.count !== 'number') {
            throw new Error(`Expected result.count to be a number, got ${typeof result.count}`);
        }

        if (result.files && result.files.length > 0) {
            console.log(`   First file: ${result.files[0].key}`);
        }

        testPassed('List files - code works exactly as documented');

    } catch (error) {
        testFailed('List files', error);
    }
}

// ============================================================================
// TEST 7: JWT Access Token (from docs)
// ============================================================================

async function test7_JwtAccessToken() {
    console.log('\n📝 TEST 7: JWT Access Token (exactly as documented)');
    console.log('---------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // EXACT CODE FROM DOCUMENTATION
        const r2Provider = client.providers.get('R2');

        // Generate token for specific file
        const token = await r2Provider.generateAccessToken({
            r2Bucket: R2_BUCKET,
            fileKey: 'confidential-report.pdf',
            permissions: ['read'],
            expiresIn: 3600
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log('Token:', token.token);

        // Validate token structure
        if (!token.token || typeof token.token !== 'string') {
            throw new Error('Expected token.token to be a string');
        }

        console.log('   Token generated successfully');

        // EXACT CODE FROM DOCUMENTATION
        // Revoke anytime
        await r2Provider.revokeAccessToken(token.token);

        console.log('   Token revoked successfully');

        testPassed('JWT access token - code works exactly as documented');

    } catch (error) {
        testFailed('JWT access token', error);
    }
}

// ============================================================================
// CLEANUP: Delete all test files
// ============================================================================

async function cleanup() {
    console.log('\n🧹 Cleaning up test files...');

    if (uploadedKeys.length === 0) {
        console.log('   No files to clean up');
        return;
    }

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const r2Provider = client.providers.get('R2');

        await r2Provider.batchDelete({
            keys: uploadedKeys,
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        console.log(`   ✅ Deleted ${uploadedKeys.length} test files`);

    } catch (error) {
        console.warn(`   ⚠️  Cleanup failed: ${error.message}`);
    }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  R2 DOCUMENTATION VALIDATION TEST SUITE                   ║');
    console.log('║  Testing wwwwwwwR2.md code examples for 100% accuracy    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();

    try {
        // Run all tests in sequence
        await test1_UploadFirstFile();
        await test2_BatchUpload();
        await test3_SingleDelete();
        await test4_BatchDelete();
        await test5_DownloadSignedUrl();
        await test6_ListFiles();
        await test7_JwtAccessToken();

        // Cleanup
        await cleanup();

        const duration = Date.now() - startTime;

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ ALL TESTS PASSED - DOCUMENTATION IS 100% ACCURATE     ║');
        console.log(`║  Duration: ${duration}ms                                    ║`);
        console.log('╚════════════════════════════════════════════════════════════╝');

        process.exit(0);

    } catch (error) {
        // Try cleanup even on failure
        await cleanup();

        const duration = Date.now() - startTime;

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ❌ TESTS FAILED - DOCUMENTATION NEEDS UPDATES            ║');
        console.log(`║  Duration: ${duration}ms                                    ║`);
        console.log('╚════════════════════════════════════════════════════════════╝');

        process.exit(1);
    }
}

// Run tests
runAllTests();
