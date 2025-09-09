// Simple test to verify ObitoX SDK works
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX (no baseUrl needed!)
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Create a test file - using the image
import fs from 'fs';
const imageBuffer = fs.readFileSync('testtt.jpg');
const file = new File([imageBuffer], 'testtt.jpg', { type: 'image/jpeg' });

// Test upload with Supabase
async function testUpload() {
  try {
    console.log('🚀 Testing ObitoX SDK with Supabase...');
    
    // Test 1: Upload to public bucket
    console.log('\n📤 Test 1: Upload to Public Bucket (test)');
    const publicFileUrl = await obitox.uploadFile(file, {
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'test', // Public bucket
      onProgress: (progress) => {
        process.stdout.write(`\r   Public upload progress: ${progress.toFixed(1)}%`);
      }
    });
    
    console.log(`\n   ✅ Public file URL: ${publicFileUrl}`);
    
    // Test 2: Upload to private bucket
    console.log('\n📤 Test 2: Upload to Private Bucket (admin)');
    const privateFileUrl = await obitox.uploadFile(file, {
      provider: 'SUPABASE',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4',
      supabaseUrl: 'https://mexdnzyfjyhwqsosbizu.supabase.co',
      bucket: 'admin', // Private bucket
      expiresIn: 3600, // 1 hour expiration for signed URL
      onProgress: (progress) => {
        process.stdout.write(`\r   Private upload progress: ${progress.toFixed(1)}%`);
      }
    });
    
    console.log(`\n   ✅ Private file URL: ${privateFileUrl}`);
    
    console.log('\n🎯 Upload Test Results:');
    console.log('   ✅ Public bucket upload successful');
    console.log('   ✅ Private bucket upload successful');
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  }
}

// Run the test
testUpload();
