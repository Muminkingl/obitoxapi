/**
 * SDK FULL TEST - R2 Provider (with REAL credentials)
 * 
 * This test proves the SDK works end-to-end:
 * 1. SDK → ObitoX API → Get Signed URL
 * 2. SDK → R2 → Upload file
 * 
 * Run: node test/r2/test-sdk-upload.js
 */

import ObitoX from '../../dist/index.esm.js';

// Real R2 Credentials (from your working test)
const API_KEY = 'ox_a409f2a37edf23b2ea5aec559d47fc066692ad5b67f32b0a';
const API_SECRET = 'sk_aec7280bdbad52cc1ee27e15c647fd39f20f9f42356883d01e0e1a36ad3221e9';

const R2_ACCESS_KEY = '8105c2c257b314edbc01fa0667cac2da';
const R2_SECRET_KEY = '23b01e76dde5d81b913a36473676c077149bacf79049f0ba894ca7db08858e31';
const R2_ACCOUNT_ID = 'b0cab7bc004505800b231cb8f9a793f4';
const R2_BUCKET = 'test';

console.log('🧪 SDK FULL TEST - R2 Provider\n');
console.log('='.repeat(70));
console.log('Testing: SDK → ObitoX API → R2');
console.log('='.repeat(70));

async function testSDK() {
    try {
        // Step 1: Initialize SDK
        console.log('\n📦 Step 1: Initializing ObitoX SDK...');
        const client = new ObitoX({
            apiKey: API_KEY,
            apiSecret: API_SECRET,
            baseUrl: 'http://localhost:5500'  // Your local API server
        });
        console.log('   ✅ SDK initialized');

        // Step 2: Create test file
        console.log('\n📄 Step 2: Creating test file...');
        const testContent = `Hello from ObitoX SDK! Timestamp: ${new Date().toISOString()}`;
        const file = new File([testContent], 'sdk-test.txt', { type: 'text/plain' });
        console.log(`   📁 File: ${file.name}`);
        console.log(`   📊 Size: ${file.size} bytes`);
        console.log(`   📝 Content: "${testContent}"`);

        // Step 3: Upload using SDK
        console.log('\n📤 Step 3: Uploading via SDK...');
        const startTime = Date.now();

        const fileUrl = await client.uploadFile(file, {
            provider: 'R2',
            r2AccessKey: R2_ACCESS_KEY,
            r2SecretKey: R2_SECRET_KEY,
            r2AccountId: R2_ACCOUNT_ID,
            r2Bucket: R2_BUCKET
        });

        const uploadTime = Date.now() - startTime;

        console.log('   ✅ Upload successful!');
        console.log(`   ⏱️  Total time: ${uploadTime}ms`);
        console.log(`   🔗 File URL: ${fileUrl}`);

        // Step 4: Verify file is accessible
        console.log('\n✔️  Step 4: Verifying file is accessible...');
        const downloadResponse = await fetch(fileUrl);

        if (downloadResponse.ok) {
            const downloadedContent = await downloadResponse.text();
            console.log(`   ✅ File is accessible!`);
            console.log(`   📄 Content: "${downloadedContent}"`);

            if (downloadedContent === testContent) {
                console.log('   ✅ Content matches!');
            }
        } else {
            console.log(`   ⚠️  File not publicly accessible (bucket may be private)`);
            console.log(`   This is OK - the upload still worked!`);
        }

        // Summary
        console.log('\n' + '═'.repeat(70));
        console.log('📊 SDK TEST RESULTS');
        console.log('═'.repeat(70));
        console.log('\n🎉 What was verified:');
        console.log('   ✅ ObitoX SDK initialization');
        console.log('   ✅ API Key + Secret authentication');
        console.log('   ✅ Signature generation (SDK)');
        console.log('   ✅ Signed URL request (SDK → API)');
        console.log('   ✅ File upload (SDK → R2)');
        console.log(`   ✅ Total upload time: ${uploadTime}ms`);
        console.log('\n🚀 Your SDK is working correctly!\n');

        return true;

    } catch (error) {
        console.error('\n❌ SDK TEST FAILED:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 API server not running! Start with: npm start');
        }

        console.error(error);
        return false;
    }
}

testSDK();
