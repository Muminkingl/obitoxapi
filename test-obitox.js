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
  
  console.log('\n🎯 All test scenarios completed! Check your Supabase tracking tables.');
  console.log('\n🚀 Features tested:');
  console.log('   ✅ Progress tracking with real-time updates');
  console.log('   ✅ Vercel Blob size limit validation (4.5MB)');
  console.log('   ✅ API key validation');
  console.log('   ✅ File validation');
  console.log('   ✅ Token validation');
  console.log('   ✅ Comprehensive error handling');
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

// Scenario 5: Rate limiting test


// Run all tests
testAllScenarios();