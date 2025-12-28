/**
 * Simple Supabase Upload Test
 * Tests the refactored Supabase operations using the SDK
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Test configuration
const YOUR_API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';
const SERVER_URL = 'http://localhost:5500';

// Supabase credentials
const SUPABASE_URL = 'https://mexdnzyfjyhwqsosbizu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4';
const BUCKET_NAME = 'admin'; // Private bucket

console.log('\n🧪 SUPABASE OPERATIONS TEST - Using SDK\n');
console.log('='.repeat(80));
console.log(`Server: ${SERVER_URL}`);
console.log(`Bucket: ${BUCKET_NAME} (priv)`);
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log('='.repeat(80));

/**
 * Test 1: Generate signed URL using SDK
 */
async function testGenerateSignedUrl() {
    console.log('\n📋 TEST 1: Generate Signed Upload URL');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${SERVER_URL}/api/v1/upload/supabase/signed-url`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: `sdk-test-${Date.now()}.txt`,
                contentType: 'text/plain',
                fileSize: 50,
                bucket: BUCKET_NAME,
                makePrivate: false,
                supabaseToken: SUPABASE_SERVICE_KEY,
                supabaseUrl: SUPABASE_URL
            })
        });

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${elapsed}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Success: ${data.success}`);

        if (data.success) {
            console.log(`   🔗 Upload URL: ${data.data.uploadUrl.substring(0, 60)}...`);
            console.log(`   📁 Filename: ${data.data.filename}`);
            console.log(`   🪣 Bucket: ${data.data.bucket}`);
            console.log(`   ⏰ Expires in: ${data.data.expiresIn}s`);

            return {
                success: true,
                uploadUrl: data.data.uploadUrl,
                token: data.data.token,
                filename: data.data.filename,
                finalUrl: data.data.fileUrl,
                elapsed
            };
        } else {
            console.log(`   ❌ Error: ${data.error}`);
            console.log(`   💬 Message: ${data.message}`);
            return { success: false, error: data };
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Test 2: Server-side upload
 */
async function testServerUpload() {
    console.log('\n📋 TEST 2: Server-Side Upload');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        // Create test file (base64)
        const testContent = `Test file uploaded at ${new Date().toISOString()}`;
        const base64Content = Buffer.from(testContent).toString('base64');

        const response = await fetch(`${SERVER_URL}/api/v1/upload/supabase/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: {
                    name: `server-upload-${Date.now()}.txt`,
                    type: 'text/plain',
                    size: testContent.length,
                    data: base64Content
                },
                bucket: BUCKET_NAME,
                makePrivate: false,
                supabaseToken: SUPABASE_SERVICE_KEY,
                supabaseUrl: SUPABASE_URL
            })
        });

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${elapsed}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Success: ${data.success}`);

        if (data.success) {
            console.log(`   📁 Filename: ${data.data.filename}`);
            console.log(`   📦 Size: ${data.data.size} bytes`);
            console.log(`   🔗 URL: ${data.data.url}`);
            console.log(`   🪣 Bucket: ${data.data.bucket}`);
            console.log(`   🔄 Attempts: ${data.data.attempts}`);

            return {
                success: true,
                filename: data.data.filename,
                url: data.data.url,
                elapsed
            };
        } else {
            console.log(`   ❌ Error: ${data.error}`);
            console.log(`   💬 Message: ${data.message}`);
            if (data.details) {
                console.log(`   🔍 Details:`, data.details);
            }
            return { success: false, error: data };
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Test 3: Download URL
 */
async function testDownload(fileUrl) {
    console.log('\n📋 TEST 3: Get Download URL');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${SERVER_URL}/api/v1/upload/supabase/download`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileUrl: fileUrl,
                bucket: BUCKET_NAME,
                supabaseToken: SUPABASE_SERVICE_KEY,
                supabaseUrl: SUPABASE_URL
            })
        });

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${elapsed}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Success: ${data.success}`);

        if (data.success) {
            console.log(`   🔗 Download URL: ${data.data.downloadUrl.substring(0, 60)}...`);
            console.log(`   📁 Filename: ${data.data.filename}`);
            console.log(`   🔓 Method: ${data.data.downloadMethod}`);

            return { success: true, elapsed };
        } else {
            console.log(`   ❌ Error: ${data.error}`);
            return { success: false, error: data };
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Test 4: Delete file
 */
async function testDelete(fileUrl) {
    console.log('\n📋 TEST 4: Delete File');
    console.log('─'.repeat(80));

    const startTime = Date.now();

    try {
        const response = await fetch(`${SERVER_URL}/api/v1/upload/supabase/delete`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileUrl: fileUrl,
                bucket: BUCKET_NAME,
                supabaseToken: SUPABASE_SERVICE_KEY,
                supabaseUrl: SUPABASE_URL
            })
        });

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        console.log(`   ⏱️  Time: ${elapsed}ms`);
        console.log(`   📊 Status: ${response.status}`);
        console.log(`   ✅ Success: ${data.success}`);

        if (data.success) {
            console.log(`   🗑️  Deleted: ${data.data.filename}`);

            return { success: true, elapsed };
        } else {
            console.log(`   ❌ Error: ${data.error}`);
            return { success: false, error: data };
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('\n⚡ RUNNING ALL TESTS...\n');

    try {
        // Test 1: Signed URL
        const signedUrlTest = await testGenerateSignedUrl();
        await new Promise(r => setTimeout(r, 500));

        // Test 2: Server Upload
        const uploadTest = await testServerUpload();
        await new Promise(r => setTimeout(r, 500));

        // Test 3: Download (only if upload succeeded)
        let downloadTest = { success: false };
        if (uploadTest.success) {
            downloadTest = await testDownload(uploadTest.url);
            await new Promise(r => setTimeout(r, 500));
        }

        // Test 4: Delete (only if upload succeeded)
        let deleteTest = { success: false };
        if (uploadTest.success) {
            deleteTest = await testDelete(uploadTest.url);
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('='.repeat(80));
        console.log(`\n✅ Results:`);
        console.log(`   1. Signed URL:    ${signedUrlTest.elapsed || 0}ms   ${signedUrlTest.success ? '✅' : '❌'}`);
        console.log(`   2. Server Upload: ${uploadTest.elapsed || 0}ms   ${uploadTest.success ? '✅' : '❌'}`);
        console.log(`   3. Download:      ${downloadTest.elapsed || 0}ms   ${downloadTest.success ? '✅' : '❌'}`);
        console.log(`   4. Delete:        ${deleteTest.elapsed || 0}ms   ${deleteTest.success ? '✅' : '❌'}`);

        const allSuccess = signedUrlTest.success && uploadTest.success && downloadTest.success && deleteTest.success;

        console.log('\n🎯 VERDICT:');
        if (allSuccess) {
            console.log('   ✅ ALL TESTS PASSED!');
            console.log('   ✅ Modular Supabase structure working perfectly');
            console.log('   ✅ Ready for production!');
        } else {
            console.log('   ⚠️  Some tests failed (check details above)');
        }

        console.log('\n' + '='.repeat(80));
        console.log('');

    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
    }
}

// Run tests
runAllTests()
    .then(() => {
        console.log('✅ Test suite complete!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test suite error:', error);
        process.exit(1);
    });
