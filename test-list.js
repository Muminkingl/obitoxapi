// Test file listing functionality with Uploadcare
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Test list functionality with Supabase
async function testList() {
  try {
    console.log('📋 Testing ObitoX List Functionality with Supabase...');
    
    // Test 1: List buckets
    console.log('\n🪣 Test 1: List Available Buckets');
    const buckets = await obitox.listBuckets({
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co'
    });
    
    console.log('✅ Buckets list successful!');
    console.log('🪣 Available buckets:', buckets.length);
    
    buckets.forEach((bucket, index) => {
      console.log(`   ${index + 1}. ${bucket.name}`);
      console.log(`      Public: ${bucket.public ? 'Yes' : 'No'}`);
      console.log(`      File Count: ${bucket.fileCount || 'Unknown'}`);
      console.log(`      Total Size: ${bucket.totalSize ? (bucket.totalSize / 1024).toFixed(2) + ' KB' : 'Unknown'}`);
      console.log('');
    });
    
    // Test 2: List files from public bucket
    console.log('\n📁 Test 2: List Files from Public Bucket (test)');
    const publicFileList = await obitox.listFiles({
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'test',
      limit: 10,
      offset: 0
    });
    
    console.log('✅ Public bucket files list successful!');
    console.log('📁 Total files in public bucket:', publicFileList.total || publicFileList.files?.length || 0);
    
    if (publicFileList.files && publicFileList.files.length > 0) {
      console.log('\n📋 Public bucket files:');
      publicFileList.files.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.filename || file.name}`);
        console.log(`      Size: ${file.size || file.fileSize} bytes`);
        console.log(`      Type: ${file.type || file.contentType}`);
        console.log(`      URL: ${file.url || file.downloadUrl}`);
        console.log(`      Uploaded: ${file.uploadedAt || file.createdAt}`);
        console.log('');
      });
    } else {
      console.log('📁 No files found in public bucket');
    }
    
    // Test 3: List files from private bucket
    console.log('\n📁 Test 3: List Files from Private Bucket (admin)');
    const privateFileList = await obitox.listFiles({
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'admin',
      limit: 10,
      offset: 0
    });
    
    console.log('✅ Private bucket files list successful!');
    console.log('📁 Total files in private bucket:', privateFileList.total || privateFileList.files?.length || 0);
    
    if (privateFileList.files && privateFileList.files.length > 0) {
      console.log('\n📋 Private bucket files:');
      privateFileList.files.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.filename || file.name}`);
        console.log(`      Size: ${file.size || file.fileSize} bytes`);
        console.log(`      Type: ${file.type || file.contentType}`);
        console.log(`      URL: ${file.url || file.downloadUrl}`);
        console.log(`      Uploaded: ${file.uploadedAt || file.createdAt}`);
        console.log('');
      });
    } else {
      console.log('📁 No files found in private bucket');
    }
    
    console.log('\n🎯 List Test Results:');
    console.log('   ✅ Bucket listing successful');
    console.log('   ✅ Public bucket file listing successful');
    console.log('   ✅ Private bucket file listing successful');
    
  } catch (error) {
    console.error('❌ List failed:', error.message);
  }
}

// Run the test
testList();
