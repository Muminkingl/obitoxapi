/**
 * Test: Progress Tracking for R2 and Vercel
 * 
 * Verifies onProgress callback works for R2 and Vercel providers.
 */

import ObitoX from './dist/index.esm.js';
import { Blob } from 'buffer';

// R2 Credentials
const R2_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const R2_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const R2_ACCOUNT_ID = 'b0cab7bc004505800b231cb8f9a793f4';
const R2_BUCKET = 'test';

// Vercel Credentials
const VERCEL_TOKEN = 'vercel_blob_rw_WEy0MBq075aMvNFK_hek9h62PrD2fc8GchpVyFDGx7kXe6p';

// ObitoX Credentials
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  PROGRESS TRACKING TEST - R2 & VERCEL                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

async function testR2Progress() {
    console.log('📦 TEST: R2 Progress Tracking');
    console.log('─'.repeat(50));

    const client = new ObitoX({
        apiKey: API_KEY,
        apiSecret: API_SECRET
    });

    const testData = 'X'.repeat(30 * 1024);  // 30KB
    const file = new Blob([testData], { type: 'text/plain' });
    file.name = `r2-progress-test-${Date.now()}.txt`;

    const progressCalls = [];

    try {
        const url = await client.uploadFile(file, {
            provider: 'R2',
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET,
            onProgress: (progress, bytesUploaded, totalBytes) => {
                progressCalls.push({ progress, bytesUploaded, totalBytes });
                console.log(`   📊 Progress: ${progress.toFixed(1)}% (${bytesUploaded}/${totalBytes})`);
            }
        });

        const hasStart = progressCalls.some(p => p.progress === 0);
        const hasEnd = progressCalls.some(p => p.progress === 100);

        if (hasStart && hasEnd) {
            console.log(`   ✅ R2 Progress PASSED! (${progressCalls.length} calls)`);
            console.log(`   URL: ${url}\n`);

            // Cleanup
            await client.deleteFile({
                provider: 'R2',
                fileUrl: url,
                r2AccessKey: R2_ACCESS_KEY,
                r2SecretKey: R2_SECRET_KEY,
                r2AccountId: R2_ACCOUNT_ID,
                r2Bucket: R2_BUCKET
            });
            console.log('   🧹 Cleaned up test file\n');
            return true;
        } else {
            console.log('   ❌ R2 Progress FAILED - missing start/end\n');
            return false;
        }

    } catch (error) {
        console.log(`   ❌ R2 Progress FAILED: ${error.message}\n`);
        return false;
    }
}

async function testVercelProgress() {
    console.log('🔷 TEST: Vercel Progress Tracking');
    console.log('─'.repeat(50));

    const client = new ObitoX({
        apiKey: API_KEY,
        apiSecret: API_SECRET
    });

    const testData = 'V'.repeat(20 * 1024);  // 20KB
    const file = new Blob([testData], { type: 'text/plain' });
    const filename = `vercel-progress-test-${Date.now()}.txt`;
    file.name = filename;

    const progressCalls = [];

    try {
        const url = await client.uploadFile(file, {
            provider: 'VERCEL',
            vercelToken: VERCEL_TOKEN,
            onProgress: (progress, bytesUploaded, totalBytes) => {
                progressCalls.push({ progress, bytesUploaded, totalBytes });
                console.log(`   📊 Progress: ${progress.toFixed(1)}% (${bytesUploaded}/${totalBytes})`);
            }
        });

        const hasStart = progressCalls.some(p => p.progress === 0);
        const hasEnd = progressCalls.some(p => p.progress === 100);

        if (hasStart && hasEnd) {
            console.log(`   ✅ Vercel Progress PASSED! (${progressCalls.length} calls)`);
            console.log(`   URL: ${url}\n`);

            // Cleanup
            await client.deleteFile({
                provider: 'VERCEL',
                fileUrl: url,
                vercelToken: VERCEL_TOKEN
            });
            console.log('   🧹 Cleaned up test file\n');
            return true;
        } else {
            console.log('   ❌ Vercel Progress FAILED - missing start/end\n');
            return false;
        }

    } catch (error) {
        console.log(`   ❌ Vercel Progress FAILED: ${error.message}\n`);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    const results = {
        r2: await testR2Progress(),
        vercel: await testVercelProgress()
    };

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  TEST RESULTS SUMMARY                                      ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  R2:     ${results.r2 ? '✅ PASSED' : '❌ FAILED'}                                        ║`);
    console.log(`║  Vercel: ${results.vercel ? '✅ PASSED' : '❌ FAILED'}                                        ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    if (results.r2 && results.vercel) {
        console.log('\n🎉 All progress tracking tests passed!');
    } else {
        console.log('\n⚠️  Some tests failed. Check logs above.');
        process.exit(1);
    }
}

runAllTests();
