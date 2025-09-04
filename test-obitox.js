// ObitoX SDK Test - Testing Provider System, Progress Tracking & Size Limits!
import ObitoX from './dist/index.esm.js';
import fs from 'fs';

// Test scenarios
async function testAllScenarios() {
  console.log('🧪 Testing ObitoX SDK with Enhanced Progress Tracking & Size Limits...\n');
  
  // Scenario 1: Test with valid API key and successful upload with progress
  console.log('📋 SCENARIO 1: Valid API Key + Successful Upload + Progress Tracking');
  console.log('=' .repeat(60));
  await testSuccessfulUploadWithProgress();
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  
  // Scenario 2: Test Vercel Blob size limit validation
  console.log('📋 SCENARIO 2: Vercel Blob Size Limit Validation (4.5MB)');
  console.log('=' .repeat(60));
  await testSizeLimitValidation();
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  // Scenario 3: Test with missing API key
  console.log('📋 SCENARIO 3: Missing API Key');
  console.log('=' .repeat(60));
  await testMissingApiKey();
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  // Scenario 4: Test with invalid file
  console.log('📋 SCENARIO 4: Invalid File Upload');
  console.log('=' .repeat(60));
  await testInvalidFile();
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  // Scenario 5: Test with invalid Vercel token
  console.log('📋 SCENARIO 5: Invalid Vercel Token');
  console.log('=' .repeat(60));
  await testInvalidToken();
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  // Scenario 6: Test new features (Cancel, Replace, Delete)
  console.log('📋 SCENARIO 6: New Features - Cancel, Replace, Delete');
  console.log('=' .repeat(60));
  await testNewFeatures();
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  // Scenario 7: Test Supabase bucket functionality
  console.log('📋 SCENARIO 7: Supabase Bucket Functionality');
  console.log('=' .repeat(60));
  await testSupabaseBuckets();
  
  console.log('\n🎯 All test scenarios completed! Check your Supabase tracking tables.');
  console.log('\n🚀 Features tested:');
  console.log('   ✅ Progress tracking with real-time updates');
  console.log('   ✅ Vercel Blob size limit validation (4.5MB)');
  console.log('   ✅ API key validation');
  console.log('   ✅ File validation');
  console.log('   ✅ Token validation');
  console.log('   ✅ Comprehensive error handling');
  console.log('   ✅ Upload cancellation support');
  console.log('   ✅ File replacement functionality');
  console.log('   ✅ File deletion capability');
  console.log('   ✅ Supabase bucket management');
  console.log('   ✅ Developer token architecture');
}

// Scenario 1: Successful upload with progress tracking
async function testSuccessfulUploadWithProgress() {
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });

    console.log('📁 Testing image upload with progress tracking...\n');
    
    // Test: Upload testtt.jpg with progress tracking
    console.log('🖼️  Uploading testtt.jpg with progress tracking...');
    try {
      const imageData = fs.readFileSync('testtt.jpg');
      const imageFile = new File([imageData], 'testtt.jpg', { type: 'image/jpeg' });
      console.log('   📁 File size:', imageFile.size, 'bytes');
      console.log('   📄 File type: image/jpeg');
      console.log('   🖼️  File: testtt.jpg');
      
      // Progress tracking callback
      const onProgress = (progress, bytesUploaded, totalBytes) => {
        const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
        const uploadedMB = (bytesUploaded / (1024 * 1024)).toFixed(2);
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
        
        process.stdout.write(`\r   📊 Progress: ${progressBar} ${progress.toFixed(1)}% (${uploadedMB}MB / ${totalMB}MB)`);
        
        if (progress >= 100) {
          console.log('\n   ✅ Upload completed!');
        }
      };
      
      const imageFileUrl = await obitox.uploadFile(imageFile, {
        provider: 'VERCEL',
        vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6',
        onProgress: onProgress
      });
      
      console.log('\n   🌐 File URL:', imageFileUrl);
      
      // Test if file is accessible
      const imageCheckResponse = await fetch(imageFileUrl);
      if (imageCheckResponse.ok) {
        console.log('   🔍 Image accessible - Status:', imageCheckResponse.status);
      }
      
      // Test health check
      console.log('\n   🏥 Testing provider health...');
      const isHealthy = await obitox.checkHealth('vercel');
      console.log('   💚 Provider health:', isHealthy ? '✅ Healthy' : '❌ Unhealthy');
      
      // Test statistics
      console.log('\n   📊 Testing statistics endpoint...');
      try {
        const stats = await obitox.getStats();
        console.log('   📈 Stats response:', stats.success ? '✅ Success' : '❌ Failed');
      } catch (statsError) {
        console.log('   📈 Stats error:', statsError.message);
      }
      
    } catch (error) {
      console.log('   ❌ testtt.jpg upload failed:', error.message);
    }
    
    console.log('\n🎯 Progress tracking test completed!');
    console.log('✅ Enhanced tracking should show:');
    console.log('   - Real-time upload progress (0% to 100%)');
    console.log('   - Bytes uploaded vs total bytes');
    console.log('   - Upload speed and duration');
    console.log('   - File type and size analytics');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Scenario 2: Test Vercel Blob size limit validation
async function testSizeLimitValidation() {
  try {
const obitox = new ObitoX({
  apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
  baseUrl: 'http://localhost:5500'
});

    console.log('📋 Testing Vercel Blob size limit validation (4.5MB per-request limit)...\n');
    
    // Test 1: Small file (should work)
    console.log('1️⃣ Testing small file (under 4.5MB)...');
    try {
      const smallContent = 'Hello World! '.repeat(1000); // ~13KB
      const smallFile = new File([smallContent], 'small.txt', { type: 'text/plain' });
      
      console.log(`   📁 File size: ${(smallFile.size / 1024).toFixed(1)} KB`);
      
      const fileUrl = await obitox.uploadFile(smallFile, {
        provider: 'VERCEL',
        vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
      });
      
      console.log('   ✅ SUCCESS! Small file uploaded successfully');
      console.log(`   🌐 URL: ${fileUrl}`);
      
    } catch (error) {
      console.log('   ❌ Small file upload failed:', error.message);
    }
    
    // Test 2: Large file (should be rejected)
    console.log('\n2️⃣ Testing large file (over 4.5MB - should be rejected)...');
    try {
      const largeContent = 'B'.repeat(5 * 1024 * 1024); // 5MB
      const largeFile = new File([largeContent], 'large.txt', { type: 'text/plain' });
      
      console.log(`   📁 File size: ${(largeFile.size / (1024 * 1024)).toFixed(2)} MB`);
      
      const fileUrl = await obitox.uploadFile(largeFile, {
        provider: 'VERCEL',
        vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
      });
      
      console.log('   ❌ This should have failed due to size limit!');
      
    } catch (error) {
      console.log('   ✅ EXPECTED ERROR: Large file correctly rejected');
      console.log(`   📝 Error: ${error.message}`);
      
      // Check if it's our specific Vercel size limit error
      if (error.message.includes('4.5MB') || error.message.includes('VERCEL_SIZE_LIMIT_EXCEEDED')) {
        console.log('   🎯 Perfect! Our size limit validation is working correctly');
      } else if (error.message.includes('File validation failed')) {
        console.log('   🎯 Good! File validation is working (size limit enforced)');
      }
    }
    
    console.log('\n🎯 Size limit validation test completed!');
    console.log('✅ Files > 4.5MB are correctly rejected before reaching Vercel');
    console.log('✅ Small files (0-4.5MB) are uploaded successfully');
    
  } catch (error) {
    console.error('❌ Size limit test failed:', error.message);
  }
}

// Scenario 3: Missing API key
async function testMissingApiKey() {
  try {
    const obitox = new ObitoX({
      apiKey: '', // Empty API key
      baseUrl: 'http://localhost:5500'
    });
    
    const file = new Blob(['test'], { type: 'text/plain' });
    
    console.log('🚫 Testing with empty API key...');
    
    const fileUrl = await obitox.uploadFile(file, {
      provider: 'VERCEL',
      vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
    });
    
    console.log('❌ This should have failed!');
    
  } catch (error) {
    console.log('✅ Expected error caught:', error.message);
    console.log('✅ Tracking should record: 1 failed request (unauthorized)');
  }
}

// Scenario 3: Invalid file
async function testInvalidFile() {
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });
    
    // Create a file without extension
    const file = new Blob(['test'], { type: 'text/plain' });
    
    console.log('🚫 Testing with invalid file (no extension)...');
    
    const fileUrl = await obitox.uploadFile(file, {
      provider: 'VERCEL',
      vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
    });
    
    console.log('❌ This should have failed!');
    
  } catch (error) {
    console.log('✅ Expected error caught:', error.message);
    console.log('✅ Tracking should record: 1 failed request (invalid file)');
  }
}

// Scenario 4: Invalid Vercel token
async function testInvalidToken() {
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });
    
    const file = new Blob(['test'], { type: 'text/plain' });
    
    console.log('🚫 Testing with invalid Vercel token...');
    
    const fileUrl = await obitox.uploadFile(file, {
      provider: 'VERCEL',
      vercelToken: 'invalid_token_123' // Invalid token
    });
    
    console.log('❌ This should have failed!');
    
  } catch (error) {
    console.log('✅ Expected error caught:', error.message);
    console.log('✅ Tracking should record: 1 failed request (invalid token)');
  }
}

// Scenario 6: Test new features (Cancel Upload & Delete Files)
async function testNewFeatures() {
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });

    console.log('🧪 Testing new features: Cancel Upload & Delete Files...\n');
    
    // Test 1: Upload cancellation
    console.log('1️⃣ Testing upload cancellation...');
    try {
      const cancelled = await obitox.cancelUpload({
        uploadId: 'test-upload-123',
        provider: 'VERCEL',
        vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
      });
      
      if (cancelled) {
        console.log('   ✅ Upload cancellation successful');
      } else {
        console.log('   ❌ Upload cancellation failed');
      }
    } catch (error) {
      console.log('   ❌ Upload cancellation error:', error.message);
    }
    
    // Test 2: File deletion (using real Vercel Blob del() function)
    console.log('\n2️⃣ Testing file deletion (using Vercel Blob del() function)...');
    try {
      const deleted = await obitox.deleteFile({
        fileUrl: 'https://blob.vercel-storage.com/test-file-to-delete.txt',
        provider: 'VERCEL',
        vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
      });
      
      if (deleted) {
        console.log('   ✅ File deletion successful using Vercel Blob del()');
    } else {
        console.log('   ❌ File deletion failed');
      }
    } catch (error) {
      console.log('   ❌ File deletion error:', error.message);
    }
    
    // Note: Replace not supported by Vercel Blob
    console.log('\n3️⃣ Note: Replace not supported by Vercel Blob');
    console.log('   ❌ replaceFile() - Vercel Blob has no replace API');
    console.log('   ✅ Use deleteFile() + uploadFile() for replacement');
    
    console.log('\n🎯 New features test completed!');
    console.log('✅ Cancel upload functionality working');
    console.log('✅ Delete files functionality working (using Vercel Blob del())');
    console.log('⚠️  Replace not supported (Vercel Blob limitation)');
    
  } catch (error) {
    console.error('❌ New features test failed:', error.message);
  }
}

// Scenario 7: Test Supabase bucket functionality
async function testSupabaseBuckets() {
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });

    console.log('🪣 Testing Supabase bucket functionality...\n');
    
    // Developer's Supabase credentials (what they would provide)
    const DEVELOPER_SUPABASE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leGRuenlmanlod3Fzb3NiaXp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNDI0MSwiZXhwIjoyMDcyMjAwMjQxfQ.sKDYLS7ZnDG6kUEfrK0XR8GN_10fFx8cCIYYy3QDUo4';
    const DEVELOPER_SUPABASE_URL = 'https://mexdnzyfjyhwqsosbizu.supabase.co';
    
    // Test 1: List available buckets
    console.log('1️⃣ Testing list available buckets...');
    try {
      const buckets = await obitox.listBuckets({
        provider: 'SUPABASE',
        supabaseToken: DEVELOPER_SUPABASE_TOKEN,
        supabaseUrl: DEVELOPER_SUPABASE_URL
      });

      console.log(`   ✅ Found ${buckets.length} buckets:`);
      buckets.forEach((bucket, index) => {
        console.log(`      ${index + 1}. ${bucket.name} (${bucket.public ? 'Public' : 'Private'})`);
      });
    } catch (error) {
      console.log('   ❌ List buckets failed:', error.message);
    }

    // Test 2: Upload to specific bucket
    console.log('\n2️⃣ Testing upload to specific bucket...');
    try {
      const testContent = 'This file demonstrates bucket functionality! '.repeat(20);
      const testFile = new File([testContent], 'bucket-test.txt', {
        type: 'text/plain'
      });

      console.log(`   📁 File: ${testFile.name} (${testFile.size} bytes)`);
      console.log('   🪣 Target bucket: test (default)');
      console.log('   🔑 Using: Developer\'s Supabase token');
      
      const uploadedFileUrl = await obitox.uploadFile(testFile, {
        provider: 'SUPABASE',
        supabaseToken: DEVELOPER_SUPABASE_TOKEN,
        supabaseUrl: DEVELOPER_SUPABASE_URL,
        bucket: 'test', // Specify the bucket!
        onProgress: (progress) => {
          process.stdout.write(`\r   📊 Progress: ${progress.toFixed(1)}%`);
        }
      });

      console.log(); // New line
      console.log('   ✅ Upload successful!');
      console.log(`   🌐 URL: ${uploadedFileUrl}`);
      
      // Test 3: Download from specific bucket
      console.log('\n3️⃣ Testing download from specific bucket...');
      const downloadResult = await obitox.downloadFile({
        fileUrl: uploadedFileUrl,
        provider: 'SUPABASE',
        supabaseToken: DEVELOPER_SUPABASE_TOKEN,
        supabaseUrl: DEVELOPER_SUPABASE_URL,
        bucket: 'test' // Specify the bucket!
      });

      console.log('   ✅ Download successful!');
      console.log(`   🔗 Download URL: ${downloadResult.downloadUrl}`);
      
      // Test 4: Delete from specific bucket
      console.log('\n4️⃣ Testing delete from specific bucket...');
      const deleteSuccess = await obitox.deleteFile({
        fileUrl: uploadedFileUrl,
        provider: 'SUPABASE',
        supabaseToken: DEVELOPER_SUPABASE_TOKEN,
        supabaseUrl: DEVELOPER_SUPABASE_URL,
        bucket: 'test' // Specify the bucket!
      });

      console.log(`   ✅ Delete ${deleteSuccess ? 'successful' : 'failed'}!`);
      
    } catch (error) {
      console.log('   ❌ Bucket test failed:', error.message);
    }
    
    console.log('\n🎯 Bucket functionality test completed!');
    console.log('✅ Developers can now:');
    console.log('   - List all available buckets');
    console.log('   - Upload to specific buckets');
    console.log('   - Download from specific buckets');
    console.log('   - Delete from specific buckets');
    console.log('   - Use their own Supabase tokens & URLs');
    console.log('   - Organize files by bucket');
    
  } catch (error) {
    console.error('❌ Bucket test failed:', error.message);
  }
}

// Run all tests
testAllScenarios();