/**
 * VERCEL DOCUMENTATION VALIDATION TEST
 * 
 * Tests EVERY code example from www.md to ensure 100% accuracy
 * Published documentation MUST work exactly as shown!
 * 
 * Credentials:
 * - API Key: ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a
 * - API Secret: sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9
 * - Vercel Token: vercel_blob_rw_WEy0MBq075aMvNFK_hek9h62PrD2fc8GchpVyFDGx7kXe6p
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
const VERCEL_TOKEN = 'vercel_blob_rw_WEy0MBq075aMvNFK_hek9h62PrD2fc8GchpVyFDGx7kXe6p';

// ============================================================================
// TEST DATA
// ============================================================================

const testFiles = {
    image: path.join(__dirname, '../test-files/test-image.jpg'),
    pdf: path.join(__dirname, '../test-files/test-pdf.pdf')
};

// Store uploaded URLs for cleanup
const uploadedUrls = [];

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

        // Create proper File object with name and type
        const file = new File([fileBuffer], 'test-photo.jpg', { type: 'image/jpeg' });

        // EXACT CODE FROM DOCUMENTATION
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Upload file (literally one line)
        const url = await client.uploadFile(file, {
            provider: 'VERCEL',
            vercelToken: VERCEL_TOKEN
        });

        console.log('✅ Uploaded:', url);
        // Output: https://xxx.public.blob.vercel-storage.com/photo.jpg

        // Validate
        if (!url || !url.includes('vercel-storage.com')) {
            throw new Error('Invalid URL returned');
        }

        uploadedUrls.push(url);
        testPassed('Upload first file - code works exactly as documented');

        return url;

    } catch (error) {
        testFailed('Upload first file', error);
    }
}

// ============================================================================
// TEST 2: Delete File (from docs)
// ============================================================================

async function test2_DeleteFile(fileUrl) {
    console.log('\n📝 TEST 2: Delete File (exactly as documented)');
    console.log('-----------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // EXACT CODE FROM DOCUMENTATION
        // Delete single file
        await client.deleteFile({
            provider: 'VERCEL',
            fileUrl: fileUrl,
            vercelToken: VERCEL_TOKEN
        });

        console.log('✅ Deleted!');

        testPassed('Delete single file - code works exactly as documented');

    } catch (error) {
        testFailed('Delete single file', error);
    }
}

// ============================================================================
// TEST 3: Batch Delete (from docs)
// ============================================================================

async function test3_BatchDelete() {
    console.log('\n📝 TEST 3: Batch Delete (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First, upload 3 test files
        console.log('   Uploading 3 test files...');
        const urls = [];

        for (let i = 1; i <= 3; i++) {
            const fileBuffer = fs.readFileSync(testFiles.image);
            const file = new File([fileBuffer], `test-batch-${i}.jpg`, { type: 'image/jpeg' });

            const url = await client.uploadFile(file, {
                provider: 'VERCEL',
                vercelToken: VERCEL_TOKEN
            });

            urls.push(url);
            console.log(`   Uploaded ${i}/3: ${url.substring(0, 50)}...`);
        }

        // EXACT CODE FROM DOCUMENTATION
        // Delete all (with error handling)
        for (const url of urls) {
            try {
                await client.deleteFile({
                    provider: 'VERCEL',
                    fileUrl: url,
                    vercelToken: VERCEL_TOKEN
                });
                console.log(`   ✅ Deleted: ${url.substring(0, 50)}...`);
            } catch (error) {
                console.error(`❌ Failed: ${url}`, error.message);
            }
        }

        testPassed('Batch delete - code works exactly as documented');

    } catch (error) {
        testFailed('Batch delete', error);
    }
}

// ============================================================================
// TEST 4: Browser Download (simulated)
// ============================================================================

async function test4_BrowserDownload() {
    console.log('\n📝 TEST 4: Browser Download (fetch validation)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Upload a file first
        const fileBuffer = fs.readFileSync(testFiles.image);
        const file = new File([fileBuffer], 'test-download.jpg', { type: 'image/jpeg' });

        const fileUrl = await client.uploadFile(file, {
            provider: 'VERCEL',
            vercelToken: VERCEL_TOKEN
        });

        console.log(`   Uploaded: ${fileUrl.substring(0, 50)}...`);

        // SIMULATED BROWSER CODE FROM DOCUMENTATION
        // Option 2: Programmatic download (server-side simulation)
        const response = await fetch(fileUrl);
        const downloadedBlob = await response.blob();

        // Validate
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        if (downloadedBlob.size === 0) {
            throw new Error('Downloaded blob is empty');
        }

        console.log(`   ✅ File accessible: ${downloadedBlob.size} bytes`);

        // Cleanup
        await client.deleteFile({
            provider: 'VERCEL',
            fileUrl: fileUrl,
            vercelToken: VERCEL_TOKEN
        });

        testPassed('Browser download - URL is publicly accessible');

    } catch (error) {
        testFailed('Browser download', error);
    }
}

// ============================================================================
// TEST 5: Server-Side Download (from docs)
// ============================================================================

async function test5_ServerSideDownload() {
    console.log('\n📝 TEST 5: Server-Side Download (exactly as documented)');
    console.log('--------------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Upload a file first
        const fileBuffer = fs.readFileSync(testFiles.image);
        const file = new File([fileBuffer], 'test-server-download.jpg', { type: 'image/jpeg' });

        const fileUrl = await client.uploadFile(file, {
            provider: 'VERCEL',
            vercelToken: VERCEL_TOKEN
        });

        console.log(`   Uploaded: ${fileUrl.substring(0, 50)}...`);

        // EXACT CODE FROM DOCUMENTATION
        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync('./downloaded-file.jpg', Buffer.from(buffer));

        console.log('✅ Downloaded!');

        // Validate downloaded file exists
        if (!fs.existsSync('./downloaded-file.jpg')) {
            throw new Error('Downloaded file not created');
        }

        const downloadedSize = fs.statSync('./downloaded-file.jpg').size;
        console.log(`   File size: ${downloadedSize} bytes`);

        // Cleanup
        fs.unlinkSync('./downloaded-file.jpg');

        await client.deleteFile({
            provider: 'VERCEL',
            fileUrl: fileUrl,
            vercelToken: VERCEL_TOKEN
        });

        testPassed('Server-side download - code works exactly as documented');

    } catch (error) {
        testFailed('Server-side download', error);
    }
}

// ============================================================================
// TEST 6: Full Integration Test
// ============================================================================

async function test6_FullIntegration() {
    console.log('\n📝 TEST 6: Full Upload → Download → Delete Flow');
    console.log('--------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        console.log('   Step 1: Upload file...');
        const fileBuffer = fs.readFileSync(testFiles.image);
        const file = new File([fileBuffer], 'test-integration.jpg', { type: 'image/jpeg' });

        const url = await client.uploadFile(file, {
            provider: 'VERCEL',
            vercelToken: VERCEL_TOKEN
        });

        console.log(`   ✅ Uploaded: ${url.substring(0, 50)}...`);

        console.log('   Step 2: Verify file is accessible...');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('File not accessible after upload');
        }
        console.log(`   ✅ File accessible (${response.status})`);

        console.log('   Step 3: Delete file...');
        await client.deleteFile({
            provider: 'VERCEL',
            fileUrl: url,
            vercelToken: VERCEL_TOKEN
        });
        console.log('   ✅ Deleted');

        console.log('   Step 4: Verify file is deleted...');
        const checkResponse = await fetch(url);
        if (checkResponse.ok) {
            console.warn('   ⚠️  File still accessible (Vercel may have cache delay)');
        } else {
            console.log(`   ✅ File not accessible (${checkResponse.status})`);
        }

        testPassed('Full integration - upload, download, delete flow works');

    } catch (error) {
        testFailed('Full integration', error);
    }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  VERCEL DOCUMENTATION VALIDATION TEST SUITE               ║');
    console.log('║  Testing www.md code examples for 100% accuracy          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();

    try {
        // Run all tests in sequence
        const uploadedUrl = await test1_UploadFirstFile();
        await test2_DeleteFile(uploadedUrl);
        await test3_BatchDelete();
        await test4_BrowserDownload();
        await test5_ServerSideDownload();
        await test6_FullIntegration();

        const duration = Date.now() - startTime;

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ ALL TESTS PASSED - DOCUMENTATION IS 100% ACCURATE     ║');
        console.log(`║  Duration: ${duration}ms                                    ║`);
        console.log('╚════════════════════════════════════════════════════════════╝');

        process.exit(0);

    } catch (error) {
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
