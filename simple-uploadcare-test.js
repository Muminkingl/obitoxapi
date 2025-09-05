import fs from 'fs';

// Simple test without authentication to verify the endpoint structure
async function testUploadcareEndpoints() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Uploadcare Endpoints');
  console.log('================================\n');

  try {
    // Test 1: Health check (no auth required)
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await fetch(`${baseUrl}/api/v1/upload/uploadcare/health`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check passed!');
      console.log(`📊 Status: ${healthData.status}`);
      console.log(`🔧 Features: ${Object.keys(healthData.features).join(', ')}`);
      console.log(`📏 Max file size: ${healthData.features.maxFileSize}`);
      console.log(`📁 Allowed types: ${healthData.features.allowedTypes.length} types`);
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
    }
    console.log('');

    // Test 2: Upload endpoint structure (should return auth error)
    console.log('2️⃣ Testing upload endpoint structure...');
    const uploadResponse = await fetch(`${baseUrl}/api/v1/upload/uploadcare/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: 'dGVzdA==', // base64 for "test"
        filename: 'test.txt',
        contentType: 'text/plain',
        fileSize: 4
      })
    });

    if (uploadResponse.status === 401) {
      console.log('✅ Upload endpoint correctly requires authentication');
      const errorData = await uploadResponse.json();
      console.log(`📝 Error message: ${errorData.message}`);
    } else {
      console.log('⚠️ Unexpected response:', uploadResponse.status);
    }
    console.log('');

    // Test 3: Delete endpoint structure (should return auth error)
    console.log('3️⃣ Testing delete endpoint structure...');
    const deleteResponse = await fetch(`${baseUrl}/api/v1/upload/uploadcare/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileUrl: 'https://ucarecdn.com/test/test.txt'
      })
    });

    if (deleteResponse.status === 401) {
      console.log('✅ Delete endpoint correctly requires authentication');
      const errorData = await deleteResponse.json();
      console.log(`📝 Error message: ${errorData.message}`);
    } else {
      console.log('⚠️ Unexpected response:', deleteResponse.status);
    }
    console.log('');

    // Test 4: Check if test file exists
    console.log('4️⃣ Checking test file availability...');
    const testFile = './testtt.jpg';
    if (fs.existsSync(testFile)) {
      const stats = fs.statSync(testFile);
      console.log('✅ Test file found!');
      console.log(`📁 File: ${testFile}`);
      console.log(`📏 Size: ${stats.size} bytes`);
      console.log(`📅 Modified: ${stats.mtime}`);
    } else {
      console.log('❌ Test file not found:', testFile);
      console.log('💡 Please ensure testtt.jpg exists in the project root');
    }
    console.log('');

    console.log('🎉 Basic endpoint tests completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Create an API key using the API key management endpoints');
    console.log('2. Use the API key to test actual upload/delete functionality');
    console.log('3. Test with different file types and sizes');

  } catch (error) {
    console.error('💥 Test error:', error.message);
  }
}

// Run the test
testUploadcareEndpoints();
