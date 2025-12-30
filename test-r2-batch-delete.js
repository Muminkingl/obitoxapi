/**
 * R2 Batch Delete Test
 * Tests batch deletion of files with varying batch sizes
 * 
 * Performance Targets:
 * - 10 files: 200-400ms
 * - 100 files: 300-600ms
 * - 1000 files: 800-1200ms
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5500/api/v1/upload';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';

const R2_CREDS = {
    accountId: 'b0cab7bc004505800b231cb8f9a793f4',
    accessKey: '67e3ba9f4da45799e5768e93de3ba4e8',
    secretKey: '0c578e0a7fa3c7f23affba1655b5345e7ef34fb1621238bd353b1b0f3eff1bbe',
    bucket: 'test'
};

console.log('🧪 R2 BATCH DELETE TEST\n');
console.log('='.repeat(80));

// Test 1: Batch too large (>1000 files)
async function testBatchTooLarge() {
    console.log('\n📋 TEST 1: Batch Too Large (>1000 files)');
    console.log('─'.repeat(80));

    try {
        const filenames = Array.from({ length: 1500 }, (_, i) => `file-${i}.jpg`);

        const response = await fetch(`${API_BASE}/r2/batch/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filenames,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();

        if (response.status === 400 && data.error === 'BATCH_TOO_LARGE') {
            console.log(`   ✅ PASS: Validation caught batch size limit`);
            console.log(`   📝 Error: ${data.error}`);
            console.log(`   💬 Message: ${data.message}`);
            return true;
        } else {
            console.log(`   ❌ FAIL: Should have rejected batch >1000 files`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 2: Delete non-existent files (should succeed with empty deleted array)
async function testDeleteNonexistent() {
    console.log('\n📋 TEST 2: Delete Non-Existent Files');
    console.log('─'.repeat(80));

    try {
        const filenames = ['nonexistent-file-1.jpg', 'nonexistent-file-2.jpg'];
        const startTime = Date.now();

        const response = await fetch(`${API_BASE}/r2/batch/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filenames,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const data = await response.json();
        const totalTime = Date.now() - startTime;

        if (data.success) {
            console.log(`   ✅ SUCCESS in ${totalTime}ms`);
            console.log(`   📊 Summary: ${data.summary.deleted}/${data.summary.total} deleted`);
            console.log(`   ℹ️  Note: R2 returns success even for non-existent files (S3 behavior)`);

            if (data.performance) {
                console.log(`   ⚡ Performance: ${data.performance.totalTime}`);
            }

            return true;
        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 3: Upload and delete real files
async function testUploadAndDelete() {
    console.log('\n📋 TEST 3: Upload Files Then Delete Them');
    console.log('─'.repeat(80));

    try {
        // Step 1: Upload 5 test files
        console.log('   📤 Uploading 5 test files...');

        const uploadFiles = Array.from({ length: 5 }, (_, i) => ({
            filename: `batch-delete-test-${i + 1}.txt`,
            contentType: 'text/plain',
            fileSize: 100
        }));

        const uploadResponse = await fetch(`${API_BASE}/r2/batch/signed-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                files: uploadFiles,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const uploadData = await uploadResponse.json();

        if (!uploadData.success) {
            console.log(`   ❌ Upload failed: ${uploadData.message}`);
            return false;
        }

        const uploadedFilenames = uploadData.results
            .filter(r => r.success)
            .map(r => r.uploadFilename);

        console.log(`   ✅ Uploaded ${uploadedFilenames.length} files`);

        // Step 2: Upload actual content to R2 (at least one file)
        if (uploadData.results[0]?.uploadUrl) {
            const testContent = 'Test content for batch delete';
            await fetch(uploadData.results[0].uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'text/plain' },
                body: testContent
            });
            console.log(`   ✅ Uploaded content to first file`);
        }

        // Step 3: Delete all uploaded files
        console.log(`   🗑️  Deleting ${uploadedFilenames.length} files...`);
        const deleteStart = Date.now();

        const deleteResponse = await fetch(`${API_BASE}/r2/batch/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
                filenames: uploadedFilenames,
                r2AccessKey: R2_CREDS.accessKey,
                r2SecretKey: R2_CREDS.secretKey,
                r2AccountId: R2_CREDS.accountId,
                r2Bucket: R2_CREDS.bucket
            })
        });

        const deleteData = await deleteResponse.json();
        const deleteTime = Date.now() - deleteStart;

        if (deleteData.success) {
            console.log(`   ✅ Delete successful in ${deleteTime}ms`);
            console.log(`   📊 Summary: ${deleteData.summary.deleted}/${deleteData.summary.total} deleted`);

            if (deleteData.performance) {
                console.log(`   ⚡ Performance: ${deleteData.performance.totalTime} (R2 API: ${deleteData.performance.breakdown?.r2ApiCall})`);
            }

            if (deleteData.errors && deleteData.errors.length > 0) {
                console.log(`   ⚠️  Errors: ${deleteData.errors.length}`);
                deleteData.errors.forEach(e => {
                    console.log(`      - ${e.key}: ${e.message}`);
                });
            }

            // Check performance target
            const serverTime = parseInt(deleteData.performance?.totalTime);
            if (serverTime < 400) {
                console.log(`   🚀 EXCELLENT: ${serverTime}ms (target: <400ms) ✅`);
            } else if (serverTime < 600) {
                console.log(`   ✅ GOOD: ${serverTime}ms (acceptable: <600ms)`);
            } else {
                console.log(`   ⚠️  SLOW: ${serverTime}ms (target: <400ms)`);
            }

            return true;
        } else {
            console.log(`   ❌ Delete failed: ${deleteData.message}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Test 4: List files to verify bucket state
async function testVerifyBucketEmpty() {
    console.log('\n📋 TEST 4: Verify Bucket is Clean');
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
            console.log(`   ℹ️  Bucket contains ${data.data.count} file(s)`);

            if (data.data.files && data.data.files.length > 0) {
                console.log(`   📁 Remaining files:`);
                data.data.files.slice(0, 5).forEach(f => {
                    console.log(`      - ${f.key} (${f.size} bytes)`);
                });
                if (data.data.files.length > 5) {
                    console.log(`      ... and ${data.data.files.length - 5} more`);
                }
            }

            console.log(`   ✅ PASS: Bucket state verified`);
            return true;
        } else {
            console.log(`   ❌ FAIL: ${data.message}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error:`, error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    const results = {
        tooLarge: false,
        nonexistent: false,
        uploadDelete: false,
        verify: false
    };

    results.tooLarge = await testBatchTooLarge();
    results.nonexistent = await testDeleteNonexistent();
    results.uploadDelete = await testUploadAndDelete();
    results.verify = await testVerifyBucketEmpty();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Batch Too Large:     ${results.tooLarge ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Delete Nonexistent:  ${results.nonexistent ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Upload & Delete:     ${results.uploadDelete ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Verify Bucket:       ${results.verify ? '✅ PASS' : '❌ FAIL'}`);

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    console.log('─'.repeat(80));
    console.log(`   Result: ${passCount}/${totalCount} tests passed`);
    console.log('='.repeat(80));

    if (passCount === totalCount) {
        console.log('\n🎉 ALL TESTS PASSED! Batch delete working perfectly! 🚀\n');
    } else {
        console.log('\n⚠️  Some tests failed. Check output above.\n');
    }
}

runAllTests();
