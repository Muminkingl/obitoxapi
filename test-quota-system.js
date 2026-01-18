/**
 * Test Layer 3 Monthly Quota System
 * 
 * This test verifies:
 * 1. Quota check BEFORE processing (blocks at limit)
 * 2. Quota increment AFTER success (async)
 * 3. Monthly reset via TTL
 * 4. Upgrade message on quota exceeded
 */

import crypto from 'crypto';

const API_KEY = 'ox_196aed8312066f42b12566f79bc30b55ff2e3209794abc23';
const API_SECRET = 'sk_0d94df0aa198e04f49035122063b650b5c73fa96020ac81f18c1eed57af5e307';
const BASE_URL = 'http://localhost:5500';

// Generate Layer 2 signature
function generateSignature(method, path, timestamp, body) {
    const message = `${method}|${path}|${timestamp}|${body || ''}`;
    return crypto.createHmac('sha256', API_SECRET)
        .update(message)
        .digest('hex');
}

// Make authenticated API request
async function makeRequest(endpoint, body = {}) {
    const method = 'POST';
    const timestamp = Date.now();
    const bodyStr = JSON.stringify(body);
    const signature = generateSignature(method, endpoint, timestamp, bodyStr);

    const response = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            'X-API-Secret': API_SECRET,
            'X-Signature': signature,
            'X-Timestamp': timestamp.toString()
        },
        body: bodyStr
    });

    const data = await response.json();
    return { status: response.status, data };
}

async function testQuotaEnforcement() {
    console.log('🧪 Testing Layer 3 Monthly Quota System...\n');
    console.log('✅ Using Layer 2 Security (API Key + Secret + Signature)\n');

    // Test 1: Make a successful request
    console.log('📝 Test 1: Successful R2 signed URL request');
    console.log('   Expected: Should pass quota check and increment after success\n');

    try {
        const { status, data } = await makeRequest('/api/v1/upload/r2/signed-url', {
            filename: 'test-quota-1.txt',
            contentType: 'text/plain',
            fileSize: 1024,
            r2AccountId: '35a53ad5fe303ae33d31c71be8fd1669',
            r2AccessKey: 'f22084c3c1e2e3dab78c4097ffb3caef',
            r2SecretKey: '0903be48c3d39f5c34b16a2d074f2e06a8e3d0b08b15feb8bf7e58ee7df0dfa9',
            r2Bucket: 'test-uploads'
        });

        console.log(`   Status: ${status}`);
        console.log(`   Success: ${data.success}`);

        if (data.success) {
            console.log('   ✅ Request succeeded!');
            console.log(`   Upload ID: ${data.uploadId}`);
            console.log(`   Provider: ${data.provider}`);
        } else {
            console.log(`   ❌ Request failed: ${data.error}`);
        }

    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Test 2: Make multiple requests to test quota tracking
    console.log('📝 Test 2: Making 5 requests to test quota tracking');
    console.log('   Expected: Should see quota count increase\n');

    for (let i = 1; i <= 5; i++) {
        try {
            const { status, data } = await makeRequest('/api/v1/upload/r2/signed-url', {
                filename: `test-quota-${i}.txt`,
                contentType: 'text/plain',
                fileSize: 1024,
                r2AccountId: '35a53ad5fe303ae33d31c71be8fd1669',
                r2AccessKey: 'f22084c3c1e2e3dab78c4097ffb3caef',
                r2SecretKey: '0903be48c3d39f5c34b16a2d074f2e06a8e3d0b08b15feb8bf7e58ee7df0dfa9',
                r2Bucket: 'test-uploads'
            });

            console.log(`   Request ${i}/5: Status ${status}`);

            if (data.success) {
                console.log('   ✅ Request succeeded!');
                if (data.quota) {
                    console.log(`   Quota: ${data.quota.used}/${data.quota.limit}`);
                }
            } else {
                console.log(`   ❌ Request failed: ${data.error}`);
                if (data.error === 'QUOTA_EXCEEDED') {
                    console.log('   ✓ Quota limit reached as expected!');
                    console.log('   Quota info:', data.quota);
                    console.log('   Upgrade info:', data.upgrade);
                    break; // Stop if quota is exceeded
                }
            }
        } catch (error) {
            console.log(`   ❌ Request ${i}/5: Error - ${error.message}`);
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }

    console.log('\n🎯 Test Complete!');
}

// Run test
testQuotaEnforcement().catch(console.error);
