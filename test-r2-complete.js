/**
 * R2 Complete Operations Test
 * Tests: Upload → List → Download → Delete
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_BASE = 'http://localhost:5500/api/v1/upload';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';

const R2_CREDS = {
    accountId: 'b0cab7bc004505800b231cb8f9a793f4',
    accessKey: '67e3ba9f4da45799e5768e93de3ba4e8',
    secretKey: '0c578e0a7fa3c7f23affba1655b5345e7ef34fb1621238bd353b1b0f3eff1bbe',
    bucket: 'test'
};

console.log('🧪 R2 COMPLETE OPERATIONS TEST\n');
console.log('='.repeat(80));

let uploadedFileKey = null;

// Test 1: Upload File
async function testUpload() {
    console.log('\n📤 TEST 1: UPLOAD FILE');
    console.log('─'.repeat(80));

    try {
        // Create test file
        const testContent = `Test file created at ${new Date().toISOString()}`;
        const testFilePath = join(__dirname, 'temp-test.txt');
        fs.writeFileSync(testFilePath, testContent);

        // Get signed URL
        const signedResponse = await fetch(`${API_BASE}/r2/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filename: 'operations-test.txt',
                contentType: 'text/plain',
                fileSize: testContent.length,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const signedData = await signedResponse.json();

        if (!signedData.success) {
            console.log('   ❌ Failed:', signedData.message);
            return false;
        }

        console.log(`   ✅ Got signed URL in ${signedData.performance?.totalTime}`);

        // Upload to R2
        const fileBuffer = fs.readFileSync(testFilePath);
        const uploadResponse = await fetch(signedData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
            body: fileBuffer
        });

        if (uploadResponse.ok) {
            console.log(`   ✅ Upload successful: ${uploadResponse.status}`);
            uploadedFileKey = signedData.data.filename;
            console.log(`   📄 File key: ${uploadedFileKey}`);
        } else {
            console.log(`   ❌ Upload failed: ${uploadResponse.status}`);
            return false;
        }

        fs.unlinkSync(testFilePath);
        return true;

    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 2: List Files
async function testList() {
    console.log('\n📁 TEST 2: LIST FILES');
    console.log('─'.repeat(80));

    try {
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ List successful in ${totalTime}ms`);
            console.log(`   📊 Server time: ${data.performance?.totalTime}`);
            console.log(`   📄 File count: ${data.data.count}`);

            if (data.data.files && data.data.files.length > 0) {
                console.log(`\n   Files in bucket:`);
                data.data.files.forEach((file, i) => {
                    const prefix = file.key === uploadedFileKey ? '👉' : '  ';
                    console.log(`   ${prefix} ${i + 1}. ${file.key} (${file.size} bytes)`);
                });
            }
            return true;
        } else {
            console.log(`   ❌ Failed:`, data.message);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 3: Download File Info
async function testDownload() {
    console.log('\n⬇️  TEST 3: DOWNLOAD FILE INFO');
    console.log('─'.repeat(80));

    if (!uploadedFileKey) {
        console.log('   ⚠️  Skipped (no file uploaded)');
        return false;
    }

    try {
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                fileKey: uploadedFileKey,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ Download info in ${totalTime}ms`);
            console.log(`   📊 Server time: ${data.performance?.totalTime}`);
            console.log(`   📄 File: ${data.data.fileKey}`);
            console.log(`   📏 Size: ${data.data.metadata?.contentLength} bytes`);
            console.log(`   📅 Modified: ${data.data.metadata?.lastModified}`);
            console.log(`   🔗 Download URL: ${data.data.downloadUrl?.substring(0, 80)}...`);
            console.log(`   🌐 Public URL: ${data.data.publicUrl}`);
            return true;
        } else {
            console.log(`   ❌ Failed:`, data.message);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 4: Delete File
async function testDelete() {
    console.log('\n🗑️  TEST 4: DELETE FILE');
    console.log('─'.repeat(80));

    if (!uploadedFileKey) {
        console.log('   ⚠️  Skipped (no file uploaded)');
        return false;
    }

    try {
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                fileKey: uploadedFileKey,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ Delete successful in ${totalTime}ms`);
            console.log(`   📊 Server time: ${data.performance?.totalTime}`);
            console.log(`   🗑️  Deleted: ${uploadedFileKey}`);
            return true;
        } else {
            console.log(`   ❌ Failed:`, data.message);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 5: Verify Deletion
async function testVerifyDeletion() {
    console.log('\n✅ TEST 5: VERIFY DELETION');
    console.log('─'.repeat(80));

    try {
        const response = await fetch(`${API_BASE}/r2/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();

        if (data.success) {
            const fileExists = data.data.files?.some(f => f.key === uploadedFileKey);

            if (!fileExists) {
                console.log(`   ✅ Confirmed: File deleted successfully`);
                console.log(`   📄 Bucket now has ${data.data.count} file(s)`);
                return true;
            } else {
                console.log(`   ❌ File still exists!`);
                return false;
            }
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    const results = {
        upload: false,
        list: false,
        download: false,
        delete: false,
        verify: false
    };

    results.upload = await testUpload();
    results.list = await testList();
    results.download = await testDownload();
    results.delete = await testDelete();
    results.verify = await testVerifyDeletion();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Upload:          ${results.upload ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   List:            ${results.list ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Download Info:   ${results.download ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Delete:          ${results.delete ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Verify Deletion: ${results.verify ? '✅ PASS' : '❌ FAIL'}`);

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    console.log('─'.repeat(80));
    console.log(`   Result: ${passCount}/${totalCount} tests passed`);
    console.log('='.repeat(80));

    if (passCount === totalCount) {
        console.log('\n🎉 ALL TESTS PASSED! R2 integration is fully functional! 🚀\n');
    } else {
        console.log('\n⚠️  Some tests failed. Check output above.\n');
    }
}

runAllTests();
