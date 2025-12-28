/**
 * COMPLETE MALWARE SCAN TEST - Upload + Scan
 * 
 * This script:
 * 1. Uploads a file directly to Uploadcare
 * 2. Initiates malware scan
 * 3. Polls for results
 * 4. Shows if file is clean or infected
 * 
 * You can test with:
 * - Any clean file: node test-upload-and-scan.js path/to/file.jpg
 * - EICAR test virus: node test-upload-and-scan.js eicar-test-virus.txt
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:5500';
const API_KEY = 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9';
const UPLOADCARE_PUBLIC_KEY = 'b538618c3e84a2fe4e0c';
const UPLOADCARE_SECRET_KEY = 'f57ea42c1a37b91a5c3c';

const filePath = process.argv[2] || 'eicar-test-virus.txt';

console.log('\n🦠 COMPLETE MALWARE SCAN TEST - Upload + Scan\n');
console.log('='.repeat(80));
console.log(`File to test: ${filePath}`);
console.log('='.repeat(80));

async function makeRequest(endpoint, method, body) {
    const response = await fetch(`${SERVER_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        },
        body: JSON.stringify(body)
    });
    return await response.json();
}

async function uploadFile(filePath) {
    console.log('\n📋 Step 1: Upload File to Uploadcare');
    console.log('─'.repeat(80));

    if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        return null;
    }

    try {
        // Upload directly to Uploadcare
        const form = new FormData();
        form.append('UPLOADCARE_PUB_KEY', UPLOADCARE_PUBLIC_KEY);
        form.append('UPLOADCARE_STORE', 'auto');
        form.append('file', fs.createReadStream(filePath));

        const uploadResponse = await fetch('https://upload.uploadcare.com/base/', {
            method: 'POST',
            body: form
        });

        const uploadResult = await uploadResponse.json();

        if (uploadResult.file) {
            console.log(`✅ File uploaded successfully!`);
            console.log(`   UUID: ${uploadResult.file}`);
            console.log(`   URL: https://ucarecdn.com/${uploadResult.file}/`);
            return uploadResult.file;
        } else {
            console.log(`❌ Upload failed:`, uploadResult);
            return null;
        }
    } catch (error) {
        console.log(`❌ Upload error: ${error.message}`);
        return null;
    }
}

async function scanFile(uuid) {
    console.log('\n📋 Step 2: Initiate Malware Scan');
    console.log('─'.repeat(80));

    const scanResult = await makeRequest('/api/v1/upload/uploadcare/scan-malware', 'POST', {
        uuid,
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY
    });

    if (!scanResult.success) {
        console.log(`❌ Scan failed: ${scanResult.message}`);
        return null;
    }

    console.log(`✅ Scan initiated!`);
    console.log(`   Request ID: ${scanResult.data.requestId}`);
    console.log(`   Cache: ${scanResult.data.cached ? 'HIT' : 'MISS'}`);
    console.log(`   Performance: ${scanResult.performance?.totalTime || 'N/A'}`);

    return scanResult.data.requestId;
}

async function waitForScan(scanRequestId) {
    console.log('\n📋 Step 3: Wait for Scan Completion');
    console.log('─'.repeat(80));
    console.log('⏳ Polling every 5 seconds...\n');

    for (let attempt = 1; attempt <= 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResult = await makeRequest('/api/v1/upload/uploadcare/scan-status', 'POST', {
            requestId: scanRequestId,
            uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
            uploadcareSecretKey: UPLOADCARE_SECRET_KEY
        });

        if (!statusResult.success) {
            console.log(`   ❌ Status check failed: ${statusResult.message}`);
            return false;
        }

        const cached = statusResult.data.cached ? '💾 CACHED' : '';
        console.log(`   [${attempt}/12] Status: ${statusResult.data.status} ${cached}`);

        if (statusResult.data.isComplete) {
            console.log(`   ✅ Scan complete!`);
            return true;
        }
    }

    console.log(`   ⏳ Scan still running after 60 seconds`);
    return false;
}

async function getResults(uuid) {
    console.log('\n📋 Step 4: Get Scan Results');
    console.log('─'.repeat(80));

    const resultsResponse = await makeRequest('/api/v1/upload/uploadcare/scan-results', 'POST', {
        uuid,
        uploadcarePublicKey: UPLOADCARE_PUBLIC_KEY,
        uploadcareSecretKey: UPLOADCARE_SECRET_KEY
    });

    if (!resultsResponse.success) {
        console.log(`   ❌ Failed: ${resultsResponse.message}`);
        return null;
    }

    const results = resultsResponse.data;

    console.log(`   UUID: ${results.uuid}`);
    console.log(`   Scan Complete: ${results.scanComplete ? 'YES' : 'NO'}`);
    console.log(`   Cached: ${results.cached ? '💾 YES' : 'NO'}`);
    console.log(`   Performance: ${resultsResponse.performance?.totalTime}`);

    console.log(`\n   🦠 INFECTED: ${results.isInfected ? '⚠️  YES' : '✅ NO'}`);

    if (results.isInfected) {
        console.log(`   🔍 Virus Name: ${results.virusName || 'Unknown'}`);
        console.log(`   ⚠️  THIS FILE CONTAINS MALWARE!`);
    } else {
        console.log(`   ✅ FILE IS CLEAN - No malware detected`);
    }

    return results;
}

async function runFullTest() {
    try {
        // Step 1: Upload
        const uuid = await uploadFile(filePath);
        if (!uuid) return;

        // Step 2: Scan
        const scanRequestId = await scanFile(uuid);
        if (!scanRequestId) return;

        // Step 3: Wait
        const complete = await waitForScan(scanRequestId);
        if (!complete) {
            console.log('\n⏳ Scan incomplete. Check back later.');
            return;
        }

        // Step 4: Results
        const results = await getResults(uuid);

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 FINAL RESULTS');
        console.log('='.repeat(80));
        console.log(`\n   File: ${filePath}`);
        console.log(`   UUID: ${uuid}`);
        console.log(`   Status: ${results?.isInfected ? '⚠️  INFECTED' : '✅ CLEAN'}`);

        if (results?.isInfected) {
            console.log(`   Virus: ${results.virusName}`);
            console.log(`\n   💡 To remove: POST /api/v1/upload/uploadcare/malware/remove-infected`);
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ Test complete!\n');

    } catch (error) {
        console.error('\n💥 Error:', error.message);
    }
}

runFullTest();
