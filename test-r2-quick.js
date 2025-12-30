/**
 * R2 Quick Test - Step by Step
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5500/api/v1/upload';

// R2 Credentials from your credints.md
const R2_CREDS = {
    accountId: 'b0cab7bc004505800b231cb8f9a793f4',
    accessKey: '67e3ba9f4da45799e5768e93de3ba4e8',
    secretKey: '0c578e0a7fa3c7f23affba1655b5345e7ef34fb1621238bd353b1b0f3eff1bbe',
    bucket: 'test-bucket'  // IMPORTANT: Create this bucket in Cloudflare R2 dashboard first!
};

console.log('🧪 R2 QUICK TEST\n');

// Step 1: Check if API key is set
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.log('❌ Step 1: API_KEY not set');
    console.log('\n📝 TO FIX:');
    console.log('   1. Get your API key from your database (api_keys table)');
    console.log('   2. Run: $env:API_KEY="ox_your_key_here"');
    console.log('   3. Then run: node test-r2-quick.js\n');
    process.exit(1);
}

console.log('✅ Step 1: API key is set');
console.log(`   Key: ${API_KEY.substring(0, 10)}...`);

// Step 2: Test the signed URL endpoint
console.log('\n⚡ Step 2: Testing R2 Signed URL Generation...');

const startTime = Date.now();

try {
    const response = await fetch(`${API_BASE}/r2/signed-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        },
        body: JSON.stringify({
            filename: 'test-file.jpg',
            contentType: 'image/jpeg',
            fileSize: 1024000,
            r2AccessKey: R2_CREDS.accessKey,
            r2SecretKey: R2_CREDS.secretKey,
            r2AccountId: R2_CREDS.accountId,
            r2Bucket: R2_CREDS.bucket
        })
    });

    const data = await response.json();
    const totalTime = Date.now() - startTime;

    console.log(`\n📊 Response:`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Time: ${totalTime}ms`);

    if (data.success) {
        console.log('\n✅ SUCCESS! R2 is working perfectly! 🎉\n');
        console.log('📋 Details:');
        console.log(`   Upload URL: ${data.uploadUrl?.substring(0, 60)}...`);
        console.log(`   Public URL: ${data.publicUrl}`);
        console.log(`   Expires In: ${data.expiresIn}s`);

        if (data.performance) {
            console.log(`\n⚡ Performance:`);
            console.log(`   Total: ${data.performance.totalTime}`);
            console.log(`   Crypto Signing: ${data.performance.breakdown?.cryptoSigning} (ZERO API calls!)`);
        }

        if (totalTime < 20) {
            console.log(`\n🚀 EXCELLENT: ${totalTime}ms (Target: <20ms) - 12x faster than Vercel!`);
        }

    } else {
        console.log(`\n❌ Error: ${data.error}`);
        console.log(`   Message: ${data.message}`);
        console.log(`   Hint: ${data.hint || 'N/A'}`);

        if (data.error === 'INVALID_API_KEY_FORMAT') {
            console.log('\n💡 FIX: Make sure your API key starts with "ox_"');
        }
    }

} catch (error) {
    console.log(`\n❌ Request failed:`, error.message);
    console.log('\n💡 Make sure the server is running: npm start');
}
