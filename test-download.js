// Test file download functionality
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Test download functionality with Supabase
async function testDownload() {
  try {
    console.log('📥 Testing ObitoX Download Functionality with Supabase...');
    
    // Test 1: Download from public bucket
    console.log('\n📥 Test 1: Download from Public Bucket (test)');
    const publicFileUrl = 'https://mexdnzyfjyhwqsosbizu.supabase.co/storage/v1/object/public/test/79cb8086_testtt_1757417071458_bc6ff73516f277dc.jpg';
    
    console.log('📁 Downloading public file:', publicFileUrl);
    
    const publicDownloadInfo = await obitox.downloadFile({
      fileUrl: publicFileUrl,
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'test'
    });
    
    console.log('📄 Public download info:', {
      filename: publicDownloadInfo.filename,
      downloadUrl: publicDownloadInfo.downloadUrl,
      fileSize: publicDownloadInfo.fileSize,
      contentType: publicDownloadInfo.contentType,
      isPrivate: publicDownloadInfo.isPrivate,
      provider: publicDownloadInfo.provider
    });
    
    // Test 2: Download from private bucket
    console.log('\n📥 Test 2: Download from Private Bucket (admin)');
    const privateFileUrl = 'https://mexdnzyfjyhwqsosbizu.supabase.co/storage/v1/object/public/admin/79cb8086_testtt_1757417600560_0e734fee502546f0.jpg';
    
    console.log('📁 Downloading private file:', privateFileUrl);
    
    const privateDownloadInfo = await obitox.downloadFile({
      fileUrl: privateFileUrl,
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'admin',
      expiresIn: 3600 // 1 hour
    });
    
    console.log('📄 Private download info:', {
      filename: privateDownloadInfo.filename,
      downloadUrl: privateDownloadInfo.downloadUrl,
      fileSize: privateDownloadInfo.fileSize,
      contentType: privateDownloadInfo.contentType,
      isPrivate: privateDownloadInfo.isPrivate,
      provider: privateDownloadInfo.provider
    });
    
    console.log('\n🎯 Download Test Results:');
    console.log('   ✅ Public bucket download successful');
    console.log('   ✅ Private bucket download successful (signed URL)');
    
    console.log('\n🔗 Download URLs:');
    console.log(`   Public: ${publicDownloadInfo.downloadUrl}`);
    console.log(`   Private: ${privateDownloadInfo.downloadUrl}`);
    console.log('💡 You can open these URLs in your browser or use them in your app');
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
  }
}

// Run the test
testDownload();
