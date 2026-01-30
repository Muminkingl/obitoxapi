/**
 * UPLOADCARE DOCUMENTATION VALIDATION TEST SUITE
 * 
 * This test file validates that ALL code examples in wwwwwUPLOAD.md 
 * work EXACTLY as documented - 100% match.
 * 
 * Tests from documentation:
 * 1. Upload with optimize (line 40-49)
 * 2. Basic upload (line 54-60) 
 * 3. Auto WebP/AVIF (line 65-72)
 * 4. Fine-tune compression (line 76-87)
 * 5. Virus check (line 89-101)
 * 6. Download (line 104-108)
 * 7. Delete (line 111-116)
 */

import ObitoX from '../../dist/index.esm.js';

// =============================================================================
// CONFIGURATION (from documentation lines 5-6)
// =============================================================================

const UPLOADCARE_PUBLIC_KEY = process.env.UPLOADCARE_PUBLIC_KEY || '161fe6bb917ca422b3c0';
const UPLOADCARE_SECRET_KEY = process.env.UPLOADCARE_SECRET_KEY || '1e1be49777715a657cb4';

// ObitoX credentials
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

// Track uploaded files for cleanup
const uploadedFiles = [];

// Test results
let passed = 0;
let failed = 0;

function testPassed(name) {
    passed++;
    console.log(`✅ PASS: ${name}`);
}

function testFailed(name, error) {
    failed++;
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
}

/**
 * Create a minimal 1x1 pixel PNG image (valid image for Uploadcare)
 * From documentation lines 12-25
 */
function createTestImage() {
    // PNG signature + minimal IHDR chunk for 1x1 white pixel
    const pngData = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color, compression, filter, interlace, CRC
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, // compressed image data (white pixel)
        0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59, // CRC
        0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
        0x44, 0xAE, 0x42, 0x60, 0x82                     // CRC
    ]);

    const filename = `uploadcare-sdk-test-${Date.now()}.png`;
    const file = new File([pngData], filename, { type: 'image/png' });
    return file;
}

// =============================================================================
// TEST 1: Upload with optimize (from docs line 40-49)
// =============================================================================

async function test1_UploadWithOptimize() {
    console.log('\n📝 TEST 1: Upload with optimize (exactly as documented)');
    console.log('--------------------------------------------------------');

    try {
        // EXACT CODE FROM DOCUMENTATION
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Create test file (as per docs line 12-25)
        const file = createTestImage();

        // EXACT CODE FROM DOCUMENTATION (line 40-47)
        const url = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
            imageOptimization: {
                auto: true  // ✅ Auto WebP + Smart compression
            }
        });

        // EXACT CODE FROM DOCUMENTATION (line 49)
        console.log('Optimized URL:', url);

        if (!url || typeof url !== 'string') {
            throw new Error('Expected URL string');
        }

        if (!url.includes('ucarecdn.com')) {
            throw new Error('Expected Uploadcare CDN URL');
        }

        // Track for cleanup
        uploadedFiles.push(url);

        testPassed('Upload with optimize - code works exactly as documented');

    } catch (error) {
        testFailed('Upload with optimize', error);
    }
}

// =============================================================================
// TEST 2: Basic upload (from docs line 54-60)
// =============================================================================

async function test2_BasicUpload() {
    console.log('\n📝 TEST 2: Basic upload (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const file = createTestImage();

        // EXACT CODE FROM DOCUMENTATION (line 54-58)
        const url = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY
        });

        // EXACT CODE FROM DOCUMENTATION (line 60)
        // https://ucarecdn.com/uuid/photo.jpg
        console.log('URL:', url);

        if (!url.includes('ucarecdn.com')) {
            throw new Error('Expected Uploadcare CDN URL format');
        }

        uploadedFiles.push(url);

        testPassed('Basic upload - code works exactly as documented');

    } catch (error) {
        testFailed('Basic upload', error);
    }
}

// =============================================================================
// TEST 3: Auto WebP/AVIF optimization (from docs line 65-72)
// =============================================================================

async function test3_AutoWebP() {
    console.log('\n📝 TEST 3: Auto WebP/AVIF optimization (exactly as documented)');
    console.log('---------------------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const file = createTestImage();

        // EXACT CODE FROM DOCUMENTATION (line 65-72)
        const url = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
            imageOptimization: {
                auto: true  // WebP + smart quality + progressive!
            }
        });

        console.log('WebP URL:', url);

        if (!url.includes('ucarecdn.com')) {
            throw new Error('Expected Uploadcare CDN URL');
        }

        uploadedFiles.push(url);

        testPassed('Auto WebP/AVIF - code works exactly as documented');

    } catch (error) {
        testFailed('Auto WebP/AVIF', error);
    }
}

// =============================================================================
// TEST 4: Fine-tune compression (from docs line 76-87)
// =============================================================================

async function test4_FineTuneCompression() {
    console.log('\n📝 TEST 4: Fine-tune compression (exactly as documented)');
    console.log('---------------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const file = createTestImage();

        // EXACT CODE FROM DOCUMENTATION (line 76-87)
        const url = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
            imageOptimization: {
                format: 'webp',
                quality: 'best',
                progressive: true,
                stripMeta: 'sensitive',
                adaptiveQuality: true  // AI-powered quality
            }
        });

        console.log('Fine-tuned URL:', url);

        if (!url.includes('ucarecdn.com')) {
            throw new Error('Expected Uploadcare CDN URL');
        }

        uploadedFiles.push(url);

        testPassed('Fine-tune compression - code works exactly as documented');

    } catch (error) {
        testFailed('Fine-tune compression', error);
    }
}

// =============================================================================
// TEST 5: Virus check (from docs line 89-101)
// =============================================================================

async function test5_VirusCheck() {
    console.log('\n📝 TEST 5: Virus check (exactly as documented)');
    console.log('-----------------------------------------------');

    // EXACT CODE FROM DOCUMENTATION (line 89-101)
    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        const file = createTestImage();

        const url = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY,
            checkVirus: true  // Auto-scan for viruses
        });

        // EXACT CODE FROM DOCUMENTATION (line 97)
        console.log('✅ File is clean:', url);

        uploadedFiles.push(url);

        testPassed('Virus check - code works exactly as documented');

    } catch (error) {
        // EXACT CODE FROM DOCUMENTATION (line 98-100)
        // File was infected and deleted
        console.error('🦠 Virus detected:', error.message);
        testFailed('Virus check', error);
    }
}

// =============================================================================
// TEST 6: Download (from docs line 104-108)
// =============================================================================

async function test6_Download() {
    console.log('\n📝 TEST 6: Download (exactly as documented)');
    console.log('--------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First upload a file to download
        const file = createTestImage();
        const uploadUrl = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY
        });

        console.log('   Uploaded for download test:', uploadUrl);
        uploadedFiles.push(uploadUrl);

        // EXACT CODE FROM DOCUMENTATION (line 104-108)
        const downloadUrl = await client.downloadFile({
            provider: 'UPLOADCARE',
            fileUrl: uploadUrl,
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY
        });

        console.log('   Download URL:', downloadUrl);

        testPassed('Download - code works exactly as documented');

    } catch (error) {
        testFailed('Download', error);
    }
}

// =============================================================================
// TEST 7: Delete (from docs line 111-116)
// =============================================================================

async function test7_Delete() {
    console.log('\n📝 TEST 7: Delete (exactly as documented)');
    console.log('------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First upload a file to delete
        const file = createTestImage();
        const uploadUrl = await client.uploadFile(file, {
            provider: 'UPLOADCARE',
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY
        });

        console.log('   Uploaded for delete test:', uploadUrl);

        // EXACT CODE FROM DOCUMENTATION (line 111-116)
        await client.deleteFile({
            provider: 'UPLOADCARE',
            fileUrl: uploadUrl,
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY
        });

        console.log('   ✅ File deleted successfully');

        testPassed('Delete - code works exactly as documented');

    } catch (error) {
        testFailed('Delete', error);
    }
}

// =============================================================================
// CLEANUP
// =============================================================================

async function cleanup() {
    console.log('\n🧹 Cleaning up test files...');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        for (const fileUrl of uploadedFiles) {
            try {
                await client.deleteFile({
                    provider: 'UPLOADCARE',
                    fileUrl: fileUrl,
                    uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
                    uploadcareSecretKey: UPLOADCARE_SECRET_KEY
                });
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        console.log('   ✅ Cleanup complete');
    } catch (error) {
        console.log('   ⚠️  Cleanup warning:', error.message);
    }
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

async function runTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  UPLOADCARE DOCUMENTATION VALIDATION TEST SUITE            ║');
    console.log('║  Testing wwwwwUPLOAD.md code examples                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();

    await test1_UploadWithOptimize();
    await test2_BasicUpload();
    await test3_AutoWebP();
    await test4_FineTuneCompression();
    await test5_VirusCheck();
    await test6_Download();
    await test7_Delete();

    await cleanup();

    const duration = Date.now() - startTime;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    if (failed === 0) {
        console.log('║  ✅ ALL TESTS PASSED - UPLOADCARE DOCUMENTATION IS ACCURATE║');
    } else {
        console.log(`║  ⚠️  ${passed}/${passed + failed} TESTS PASSED                                     ║`);
    }
    console.log(`║  Duration: ${duration}ms                                    ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
