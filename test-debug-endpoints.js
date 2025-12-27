/**
 * Debug Test for Complete & Track Endpoints
 * Simple test to see what's failing
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const YOUR_API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';
const SERVER_URL = 'http://localhost:5500';

console.log('\n🔍 DEBUGGING COMPLETE & TRACK ENDPOINTS\n');

// Test 1: Complete endpoint
async function testComplete() {
    console.log('📋 Testing /vercel/complete...');

    try {
        const response = await fetch(`${SERVER_URL}/api/v1/upload/vercel/complete`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: 'test-file.txt',
                fileUrl: 'https://example.com/test.txt',
                fileSize: 100,
                provider: 'vercel'
            })
        });

        const data = await response.json();

        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(data, null, 2));
        console.log('');

        return { status: response.status, data };
    } catch (error) {
        console.log(`   ERROR: ${error.message}`);
        console.log('');
        return { error: error.message };
    }
}

// Test 2: Track endpoint
async function testTrack() {
    console.log('📋 Testing /vercel/track...');

    try {
        const response = await fetch(`${SERVER_URL}/api/v1/upload/vercel/track`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event: 'completed',
                filename: 'test-file.txt',
                fileUrl: 'https://example.com/test.txt',
                fileSize: 100,
                provider: 'vercel'
            })
        });

        const data = await response.json();

        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(data, null, 2));
        console.log('');

        return { status: response.status, data };
    } catch (error) {
        console.log(`   ERROR: ${error.message}`);
        console.log('');
        return { error: error.message };
    }
}

// Test 3: Upload endpoint (for comparison - this one works)
async function testUpload() {
    console.log('📋 Testing /vercel/upload (for comparison)...');

    try {
        const testFile = 'Test content';
        const base64 = Buffer.from(testFile).toString('base64');

        const response = await fetch(`${SERVER_URL}/api/v1/upload/vercel/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': YOUR_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: base64,
                filename: 'debug-test.txt',
                contentType: 'text/plain',
                vercelToken: process.env.VERCEL_TOKEN
            })
        });

        const data = await response.json();

        console.log(`   Status: ${response.status}`);
        console.log(`   Success: ${data.success}`);
        console.log('');

        return { status: response.status, data };
    } catch (error) {
        console.log(`   ERROR: ${error.message}`);
        console.log('');
        return { error: error.message };
    }
}

// Run all tests
async function runDebugTests() {
    console.log('='.repeat(60));

    const complete = await testComplete();
    const track = await testTrack();
    const upload = await testUpload();

    console.log('='.repeat(60));
    console.log('\n📊 SUMMARY:');
    console.log(`   Complete: ${complete.status || 'FAILED'} ${complete.status === 200 ? '✅' : '❌'}`);
    console.log(`   Track:    ${track.status || 'FAILED'} ${track.status === 200 ? '✅' : '❌'}`);
    console.log(`   Upload:   ${upload.status || 'FAILED'} ${upload.status === 200 ? '✅' : '❌'}`);
    console.log('');

    // Show error details if any
    if (complete.status === 500) {
        console.log('⚠️  Complete endpoint error:', complete.data);
    }
    if (track.status === 500) {
        console.log('⚠️  Track endpoint error:', track.data);
    }
}

runDebugTests()
    .then(() => console.log('✅ Debug test complete\n'))
    .catch(err => console.error('❌ Test failed:', err));
