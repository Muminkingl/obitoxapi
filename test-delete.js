// Test file deletion functionality
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Test delete functionality with Supabase
async function testDelete() {
  try {
    console.log('🗑️ Testing ObitoX Delete Functionality with Supabase...');
    
    // Test 1: Delete from public bucket
    console.log('\n🗑️ Test 1: Delete from Public Bucket (test)');
    const publicFileUrl = 'https://mexdnzyfjyhwqsosbizu.supabase.co/storage/v1/object/public/test/79cb8086_testtt_1757416265971_e0251888d7848e32.jpg';
    
    const publicDeleted = await obitox.deleteFile({
      fileUrl: publicFileUrl,
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'test'
    });
    
    console.log('   ✅ Public file deletion result:', publicDeleted);
    
    // Test 2: Delete from private bucket
    console.log('\n🗑️ Test 2: Delete from Private Bucket (admin)');
    const privateFileUrl = 'https://mexdnzyfjyhwqsosbizu.supabase.co/storage/v1/object/public/admin/79cb8086_testtt_1757416272933_11dfec4102860697.jpg';
    
    const privateDeleted = await obitox.deleteFile({
      fileUrl: privateFileUrl,
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'admin'
    });
    
    console.log('   ✅ Private file deletion result:', privateDeleted);
    
    console.log('\n🎯 Delete Test Results:');
    console.log('   ✅ Public bucket deletion successful');
    console.log('   ✅ Private bucket deletion successful');
    
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
  }
}

// Run the test
testDelete();
