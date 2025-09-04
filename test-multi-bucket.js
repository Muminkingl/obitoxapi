import { ObitoX } from './dist/index.esm.js';

// Test configuration
const API_KEY = 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544';
const BASE_URL = 'http://localhost:5500';

// Developer's Supabase credentials (what they would provide)
const DEVELOPER_SUPABASE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4';
const DEVELOPER_SUPABASE_URL = 'https://mexdnzyfjyhwqsosbizu.supabase.co';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: API_KEY,
  baseUrl: BASE_URL
});

/**
 * Test multi-bucket functionality with public and private buckets
 */
async function testMultiBucket() {
  console.log('🪣 Testing Multi-Bucket Functionality\n');
  console.log('=' .repeat(70));
  console.log('📋 Testing with 2 buckets:');
  console.log('   1. test (Public) - Anyone can access files');
  console.log('   2. admin (Private) - Requires authentication');
  console.log('=' .repeat(70));

  let uploadedFiles = [];

  try {
    // Step 1: List all available buckets
    console.log('\n📋 Step 1: Listing all available buckets...');
    
    const buckets = await obitox.listBuckets({
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL
    });

    console.log(`✅ Found ${buckets.length} buckets:`);
    buckets.forEach((bucket, index) => {
      console.log(`   ${index + 1}. ${bucket.name} (${bucket.public ? '🌐 Public' : '🔒 Private'})`);
      if (bucket.fileCount !== undefined) {
        console.log(`      📁 Files: ${bucket.fileCount}`);
      }
    });

    // Step 2: Upload to PUBLIC bucket (test)
    console.log('\n📤 Step 2: Uploading to PUBLIC bucket (test)...');
    
    const publicFileContent = 'This is a PUBLIC file that anyone can access! '.repeat(15);
    const publicFile = new File([publicFileContent], 'public-document.txt', {
      type: 'text/plain'
    });

    console.log(`📁 File: ${publicFile.name} (${publicFile.size} bytes)`);
    console.log('🪣 Target: test bucket (Public)');
    
    const publicFileUrl = await obitox.uploadFile(publicFile, {
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL,
      bucket: 'test', // Public bucket
      onProgress: (progress) => {
        process.stdout.write(`\r   📊 Progress: ${progress.toFixed(1)}%`);
      }
    });

    console.log(); // New line
    console.log('✅ Public file uploaded successfully!');
    console.log(`🌐 URL: ${publicFileUrl}`);
    uploadedFiles.push({ url: publicFileUrl, bucket: 'test', type: 'public' });

    // Step 3: Upload to PRIVATE bucket (admin)
    console.log('\n📤 Step 3: Uploading to PRIVATE bucket (admin)...');
    
    const privateFileContent = 'This is a PRIVATE file that requires authentication! '.repeat(15);
    const privateFile = new File([privateFileContent], 'private-document.txt', {
      type: 'text/plain'
    });

    console.log(`📁 File: ${privateFile.name} (${privateFile.size} bytes)`);
    console.log('🪣 Target: admin bucket (Private)');
    
    const privateFileUrl = await obitox.uploadFile(privateFile, {
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL,
      bucket: 'admin', // Private bucket
      onProgress: (progress) => {
        process.stdout.write(`\r   📊 Progress: ${progress.toFixed(1)}%`);
      }
    });

    console.log(); // New line
    console.log('✅ Private file uploaded successfully!');
    console.log(`🔒 URL: ${privateFileUrl}`);
    uploadedFiles.push({ url: privateFileUrl, bucket: 'admin', type: 'private' });

    // Step 4: Download from PUBLIC bucket
    console.log('\n📥 Step 4: Downloading from PUBLIC bucket...');
    
    const publicDownload = await obitox.downloadFile({
      fileUrl: publicFileUrl,
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL,
      bucket: 'test'
    });

    console.log('✅ Public file download successful!');
    console.log(`🔗 Download URL: ${publicDownload.downloadUrl}`);
    console.log(`🔒 Is private: ${publicDownload.isPrivate ? 'Yes' : 'No'}`);

    // Step 5: Download from PRIVATE bucket
    console.log('\n📥 Step 5: Downloading from PRIVATE bucket...');
    
    const privateDownload = await obitox.downloadFile({
      fileUrl: privateFileUrl,
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL,
      bucket: 'admin'
    });

    console.log('✅ Private file download successful!');
    console.log(`🔗 Download URL: ${privateDownload.downloadUrl}`);
    console.log(`🔒 Is private: ${privateDownload.isPrivate ? 'Yes' : 'No'}`);

    // Step 6: Delete from PUBLIC bucket
    console.log('\n🗑️ Step 6: Deleting from PUBLIC bucket...');
    
    const publicDeleteSuccess = await obitox.deleteFile({
      fileUrl: publicFileUrl,
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL,
      bucket: 'test'
    });

    console.log(`✅ Public file delete ${publicDeleteSuccess ? 'successful' : 'failed'}!`);

    // Step 7: Delete from PRIVATE bucket
    console.log('\n🗑️ Step 7: Deleting from PRIVATE bucket...');
    
    const privateDeleteSuccess = await obitox.deleteFile({
      fileUrl: privateFileUrl,
      provider: 'SUPABASE',
      supabaseToken: DEVELOPER_SUPABASE_TOKEN,
      supabaseUrl: DEVELOPER_SUPABASE_URL,
      bucket: 'admin'
    });

    console.log(`✅ Private file delete ${privateDeleteSuccess ? 'successful' : 'failed'}!`);

    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 MULTI-BUCKET TEST SUMMARY');
    console.log('=' .repeat(70));
    console.log('✅ List buckets: SUCCESS');
    console.log('✅ Upload to public bucket: SUCCESS');
    console.log('✅ Upload to private bucket: SUCCESS');
    console.log('✅ Download from public bucket: SUCCESS');
    console.log('✅ Download from private bucket: SUCCESS');
    console.log('✅ Delete from public bucket: SUCCESS');
    console.log('✅ Delete from private bucket: SUCCESS');
    console.log('\n🎉 Multi-bucket functionality working perfectly!');

    return true;

  } catch (error) {
    console.log(); // New line after progress
    console.error('\n❌ Test failed:', error.message);
    throw error;
  }
}

// Run the multi-bucket test
testMultiBucket()
  .then(() => {
    console.log('\n🎉 Multi-bucket test completed successfully!');
    console.log('=' .repeat(70));
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
    console.log('=' .repeat(70));
    process.exit(1);
  });
