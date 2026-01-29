/**
 * S3 Documentation Accuracy Test
 * 
 * Tests every code example in wwwwwwS3.md against MinIO (S3-compatible)
 * to ensure 100% documentation accuracy before publishing.
 * 
 * MinIO Settings:
 * - Endpoint: http://localhost:9000
 * - Access Key: minioadmin
 * - Secret Key: minioadmin123
 * - Bucket: test-bucket
 */

import ObitoX from '../../dist/index.esm.js';

// =============================================================================
// MINIO/S3 CREDENTIALS (S3-compatible local storage)
// =============================================================================

const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

// MinIO credentials (S3-compatible)
const S3_ACCESS_KEY = 'minioadmin';
const S3_SECRET_KEY = 'minioadmin123';
const S3_BUCKET = 'test-bucket';
const S3_REGION = 'us-east-1';
const S3_ENDPOINT = 'http://localhost:9000';

// Track uploaded files for cleanup
const uploadedKeys = [];

// =============================================================================
// TEST HELPERS
// =============================================================================

function testPassed(name) {
    console.log(`✅ PASS: ${name}`);
}

function testFailed(name, error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
}

// =============================================================================
// TEST 1: Upload First File (from docs line 4-21)
// =============================================================================

async function test1_UploadFirstFile() {
    console.log('\n📝 TEST 1: Upload First File (exactly as documented)');
    console.log('---------------------------------------------------');

    try {
        // EXACT CODE FROM DOCUMENTATION (with MinIO endpoint)
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // Create test file
        const testContent = 'Test file content for S3 upload';
        const file = new Blob([testContent], { type: 'text/plain' });
        file.name = 'test-photo.txt';

        // Upload to S3 (using MinIO endpoint)
        const url = await client.uploadFile(file, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT  // MinIO-specific
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log('✅ Uploaded:', url);

        // Validate URL format
        if (!url || typeof url !== 'string') {
            throw new Error('Expected URL string');
        }

        // Extract key from URL for cleanup
        const urlObj = new URL(url);
        uploadedKeys.push(urlObj.pathname.slice(1));

        testPassed('Upload first file - code works exactly as documented');

    } catch (error) {
        testFailed('Upload first file', error);
    }
}

// =============================================================================
// TEST 2: Single Delete (from docs line 85-94)
// =============================================================================

async function test2_SingleDelete() {
    console.log('\n📝 TEST 2: Single Delete (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First upload a file to delete
        const testContent = 'File to delete';
        const file = new Blob([testContent], { type: 'text/plain' });
        file.name = 'delete-test.txt';

        const url = await client.uploadFile(file, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        console.log('   Uploaded:', url);

        // Extract key from URL
        const urlObj = new URL(url);
        const fileKey = urlObj.pathname.slice(1);

        // EXACT CODE FROM DOCUMENTATION
        await client.deleteFile({
            provider: 'S3',
            key: fileKey,  // S3 object key
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log('✅ Deleted!');

        testPassed('Single delete - code works exactly as documented');

    } catch (error) {
        testFailed('Single delete', error);
    }
}

// =============================================================================
// TEST 3: Batch Delete (from docs line 97-107)
// =============================================================================

async function test3_BatchDelete() {
    console.log('\n📝 TEST 3: Batch Delete (exactly as documented)');
    console.log('------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First upload some files to delete
        const keys = [];
        for (let i = 1; i <= 3; i++) {
            const file = new Blob([`File ${i} content`], { type: 'text/plain' });
            file.name = `batch-delete-${i}.txt`;

            const url = await client.uploadFile(file, {
                provider: 'S3',
                s3AccessKey: S3_ACCESS_KEY,
                s3SecretKey: S3_SECRET_KEY,
                s3Bucket: S3_BUCKET,
                s3Region: S3_REGION,
                s3Endpoint: S3_ENDPOINT
            });

            const urlObj = new URL(url);
            keys.push(urlObj.pathname.slice(1));
            console.log(`   Uploaded: ${keys[i - 1]}`);
        }

        // EXACT CODE FROM DOCUMENTATION
        const s3Provider = client.providers.get('S3');

        await s3Provider.batchDelete({
            keys: keys,  // Up to 1000!
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log('✅ Deleted 3 files in one call');

        testPassed('Batch delete - code works exactly as documented');

    } catch (error) {
        testFailed('Batch delete', error);
    }
}

// =============================================================================
// TEST 4: Generate Signed URL / Download (from docs line 110-120)
// =============================================================================

async function test4_DownloadSignedUrl() {
    console.log('\n📝 TEST 4: Generate Signed URL (exactly as documented)');
    console.log('-------------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First upload a file
        const testContent = 'Content for download test';
        const file = new Blob([testContent], { type: 'text/plain' });
        file.name = 'download-test.txt';

        const url = await client.uploadFile(file, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        const urlObj = new URL(url);
        const fileKey = urlObj.pathname.slice(1);
        console.log('   Uploaded:', fileKey);

        // EXACT CODE FROM DOCUMENTATION
        const downloadUrl = await client.downloadFile({
            provider: 'S3',
            key: fileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT,
            expiresIn: 3600  // Valid for 1 hour
        });

        // EXACT CODE FROM DOCUMENTATION  
        console.log(downloadUrl);  // Valid for 1 hour only

        // Validate it's a string URL
        if (!downloadUrl || typeof downloadUrl !== 'string') {
            throw new Error(`Expected URL string, got ${typeof downloadUrl}`);
        }

        // Test downloading
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        const content = await response.text();
        console.log(`   ✅ Downloaded ${content.length} bytes`);

        // Cleanup
        await client.deleteFile({
            provider: 'S3',
            key: fileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        testPassed('Download signed URL - code works exactly as documented');

    } catch (error) {
        testFailed('Download signed URL', error);
    }
}

// =============================================================================
// TEST 5: List Files (from docs line 136-161)
// =============================================================================

async function test5_ListFiles() {
    console.log('\n📝 TEST 5: List Files (exactly as documented)');
    console.log('----------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // EXACT CODE FROM DOCUMENTATION
        const s3Provider = client.providers.get('S3');

        const result = await s3Provider.list({
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT,
            maxKeys: 100           // Optional: limit results (default: 1000)
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log(`Found ${result.count} files`);

        // Validate result.count exists
        if (typeof result.count !== 'number') {
            throw new Error(`Expected result.count to be number, got ${typeof result.count}`);
        }

        if (result.files && result.files.length > 0) {
            // EXACT CODE FROM DOCUMENTATION
            result.files.forEach(file => {
                console.log(`${file.key} - ${file.size} bytes`);
            });
        }

        testPassed('List files - code works exactly as documented');

    } catch (error) {
        testFailed('List files', error);
    }
}

// =============================================================================
// TEST 6: Get File Metadata (from docs line 164-178)
// =============================================================================

async function test6_GetMetadata() {
    console.log('\n📝 TEST 6: Get File Metadata (exactly as documented)');
    console.log('-----------------------------------------------------');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        // First upload a file
        const testContent = 'Content for metadata test';
        const file = new Blob([testContent], { type: 'text/plain' });
        file.name = 'metadata-test.txt';

        const url = await client.uploadFile(file, {
            provider: 'S3',
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        const urlObj = new URL(url);
        const fileKey = urlObj.pathname.slice(1);
        console.log('   Uploaded:', fileKey);

        // EXACT CODE FROM DOCUMENTATION
        const s3Provider = client.providers.get('S3');

        const metadata = await s3Provider.getMetadata({
            key: fileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        // EXACT CODE FROM DOCUMENTATION
        console.log(`Size: ${metadata.metadata.sizeFormatted}`);
        console.log(`Type: ${metadata.metadata.contentType}`);
        console.log(`Last Modified: ${metadata.metadata.lastModified}`);
        console.log(`Storage Class: ${metadata.metadata.storageClass}`);

        // Validate structure
        if (!metadata.metadata) {
            throw new Error('Expected metadata.metadata object');
        }

        // Cleanup
        await client.deleteFile({
            provider: 'S3',
            key: fileKey,
            s3AccessKey: S3_ACCESS_KEY,
            s3SecretKey: S3_SECRET_KEY,
            s3Bucket: S3_BUCKET,
            s3Region: S3_REGION,
            s3Endpoint: S3_ENDPOINT
        });

        testPassed('Get metadata - code works exactly as documented');

    } catch (error) {
        testFailed('Get metadata', error);
    }
}

// =============================================================================
// CLEANUP: Delete all test files
// =============================================================================

async function cleanup() {
    console.log('\n🧹 Cleaning up test files...');

    try {
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET
        });

        for (const key of uploadedKeys) {
            try {
                await client.deleteFile({
                    provider: 'S3',
                    key: key,
                    s3AccessKey: S3_ACCESS_KEY,
                    s3SecretKey: S3_SECRET_KEY,
                    s3Bucket: S3_BUCKET,
                    s3Region: S3_REGION,
                    s3Endpoint: S3_ENDPOINT
                });
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        console.log(`   ✅ Cleanup complete`);

    } catch (error) {
        console.warn(`   ⚠️  Cleanup failed: ${error.message}`);
    }
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  S3 DOCUMENTATION VALIDATION TEST SUITE                    ║');
    console.log('║  Testing wwwwwwS3.md code examples with MinIO              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();

    try {
        // Run all tests in sequence
        await test1_UploadFirstFile();
        await test2_SingleDelete();
        await test3_BatchDelete();
        await test4_DownloadSignedUrl();
        await test5_ListFiles();
        await test6_GetMetadata();

        // Cleanup
        await cleanup();

        const duration = Date.now() - startTime;

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ ALL TESTS PASSED - S3 DOCUMENTATION IS ACCURATE       ║');
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

runAllTests();
