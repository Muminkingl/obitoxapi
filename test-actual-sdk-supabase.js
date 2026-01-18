/**
 * ACTUAL SDK TEST - Supabase Provider
 * 
 * This tests Supabase Storage operations via the SDK:
 * 1. SDK Initialization
 * 2. Provider Registry Check
 * 3. File Upload
 * 4. File Download URL
 * 5. File Deletion
 */

import ObitoX from './dist/client.js';

//

const API_KEY = 'ox_44fe86d006bd8358a7dc7b01f2626ae5f724f0122c1bf79f';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_TOKEN = process.env.SUPABASE_TOKEN || 'your-service-role-key';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'your-bucket-name';



console.log('🎯 ACTUAL REFACTORED SDK TEST - SUPABASE PROVIDER (Core)\n');
console.log('='.repeat(80));
console.log('Testing the REAL ObitoX SDK with Supabase Storage!');
console.log('This uses the refactored Supabase Provider!\n');
console.log('='.repeat(80));

const results = {
    sdkInit: false,
    providerCheck: false,
    fileUpload: false,
    fileDownload: false,
    fileDeletion: false,
};

let uploadedFileUrl = '';
let uploadedFilename = '';

// =============================================================================
// Test 1: SDK Initialization
// =============================================================================
async function testSDKInit() {
    console.log('\n📋 TEST 1: SDK Initialization');
    console.log('─'.repeat(80));

    try {
        const client = new ObitoX({ apiKey: API_KEY });

        console.log('   ✅ SDK initialized successfully!');
        console.log(`   🏗️  Constructor: ${client.constructor.name}`);

        results.sdkInit = true;
        return client;
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        return null;
    }
}

// =============================================================================
// Test 2: Provider Registry Check
// =============================================================================
async function testProviderCheck(client) {
    console.log('\n📋 TEST 2: Provider Registry Check');
    console.log('─'.repeat(80));

    try {
        console.log('   🔍 Calling client.getAvailableProviders()...');
        const providers = client.getAvailableProviders();
        console.log(`   ✅ Available providers: ${providers.join(', ')}`);

        console.log('   🔍 Calling client.isProviderSupported("SUPABASE")...');
        const isSupported = client.isProviderSupported('SUPABASE');
        console.log(`   ✅ Supabase supported: ${isSupported ? 'YES' : 'NO'}`);

        if (providers.includes('SUPABASE') && isSupported) {
            results.providerCheck = true;
            return true;
        } else {
            console.log('   ❌ Supabase provider not found!');
            return false;
        }
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        return false;
    }
}

// =============================================================================
// Test 3: File Upload
// =============================================================================
async function testFileUpload(client) {
    console.log('\n📋 TEST 3: File Upload via SDK');
    console.log('─'.repeat(80));

    try {
        const testContent = `SUPABASE SDK TEST - ${new Date().toISOString()}`;
        const filename = `supabase-sdk-test-${Date.now()}.txt`;
        const file = new File([testContent], filename, { type: 'text/plain' });

        console.log('   📦 Test file created');
        console.log(`   📏 Filename: ${filename}`);
        console.log('   🔍 Calling client.uploadFile()...');

        const fileUrl = await client.uploadFile(file, {
            provider: 'SUPABASE',
            supabaseUrl: SUPABASE_URL,
            supabaseToken: SUPABASE_TOKEN,
            bucket: SUPABASE_BUCKET
        });

        console.log(`   ✅ Upload completed!`);
        console.log(`   🔗 File URL: ${fileUrl}`);

        uploadedFileUrl = fileUrl;
        uploadedFilename = filename;
        results.fileUpload = true;
        return fileUrl;
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        console.log('   Stack:', error.stack);
        return null;
    }
}

// =============================================================================
// Test 4: File Download
// =============================================================================
async function testFileDownload(client, fileUrl) {
    console.log('\n📋 TEST 4: Get Download URL via SDK');
    console.log('─'.repeat(80));

    try {
        console.log('   🔍 Calling client.downloadFile()...');

        const downloadInfo = await client.downloadFile({
            fileUrl: fileUrl,
            provider: 'SUPABASE'
        });

        const downloadUrl = typeof downloadInfo === 'string' ? downloadInfo : (downloadInfo.downloadUrl || downloadInfo.url);

        if (downloadUrl) {
            console.log('   ✅ Download URL retrieved via SDK!');
            console.log(`   🔗 URL: ${downloadUrl}`);
            results.fileDownload = true;
            return true;
        } else {
            console.log('   ❌ Failed to get download URL', downloadInfo);
            return false;
        }
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        return false;
    }
}

// =============================================================================
// Test 5: File Deletion
// =============================================================================
async function testFileDeletion(client, fileUrl) {
    console.log('\n📋 TEST 5: File Deletion via SDK');
    console.log('─'.repeat(80));

    try {
        console.log('   🔍 Calling client.deleteFile()...');

        const deleteResult = await client.deleteFile({
            fileUrl: fileUrl,
            provider: 'SUPABASE'
        });

        console.log('   🗑️  Delete result:', deleteResult);
        console.log('   ✅ File deleted via SDK!');

        results.fileDeletion = true;
        return true;
    } catch (error) {
        console.log('   ❌ FAIL:', error.message);
        return false;
    }
}

// =============================================================================
// Run All Tests
// =============================================================================
async function runAllTests() {
    try {
        const client = await testSDKInit();
        if (!client) return;

        await testProviderCheck(client);
        const fileUrl = await testFileUpload(client);

        if (fileUrl) {
            await testFileDownload(client, fileUrl);
            await testFileDeletion(client, fileUrl);
        }

        printSummary();
    } catch (error) {
        console.log('\n❌ CRITICAL ERROR:', error.message);
        printSummary();
    }
}

function printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUPABASE SDK TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   1. SDK Init:       ${results.sdkInit ? '✅' : '❌'}`);
    console.log(`   2. Provider Check: ${results.providerCheck ? '✅' : '❌'}`);
    console.log(`   3. Upload:         ${results.fileUpload ? '✅' : '❌'}`);
    console.log(`   4. Download:       ${results.fileDownload ? '✅' : '❌'}`);
    console.log(`   5. Deletion:       ${results.fileDeletion ? '✅' : '❌'}`);
    console.log('='.repeat(80));
}

runAllTests();
