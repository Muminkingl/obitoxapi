import fs from 'fs';

// Test Uploadcare with authentication
async function testUploadcareWithAuth() {
  const baseUrl = 'http://localhost:3000';
  
  // For testing, let's use a mock API key format
  // In a real scenario, you'd get this from your API key management system
  const testApiKey = 'ox_test_1234567890abcdef';
  
  console.log('🧪 Testing Uploadcare with Authentication');
  console.log('==========================================\n');

  try {
    // Test 1: Validate API key format
    console.log('1️⃣ Testing API key validation...');
    const validateResponse = await fetch(`${baseUrl}/api/v1/apikeys/validate?apiKey=${testApiKey}`);
    
    if (validateResponse.ok) {
      const validateData = await validateResponse.json();
      console.log('✅ API key validation passed!');
      console.log(`📊 User ID: ${validateData.userId}`);
      console.log(`🔑 API Key ID: ${validateData.apiKeyId}`);
    } else {
      const errorData = await validateResponse.json();
      console.log('❌ API key validation failed:', errorData.message);
      console.log('💡 This is expected if the API key doesn\'t exist in the database');
    }
    console.log('');

    // Test 2: Upload with authentication
    console.log('2️⃣ Testing upload with authentication...');
    
    // Read the test image
    const testFile = './testtt.jpg';
    if (!fs.existsSync(testFile)) {
      console.log('❌ Test file not found:', testFile);
      return;
    }
    
    const fileBuffer = fs.readFileSync(testFile);
    const base64File = fileBuffer.toString('base64');
    const fileStats = fs.statSync(testFile);
    
    console.log(`📁 Uploading: ${testFile}`);
    console.log(`📏 Size: ${fileStats.size} bytes`);
    
    const uploadResponse = await fetch(`${baseUrl}/api/v1/upload/uploadcare/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': testApiKey
      },
      body: JSON.stringify({
        file: base64File,
        filename: 'test-uploadcare.jpg',
        contentType: 'image/jpeg',
        fileSize: fileStats.size
      })
    });

    if (uploadResponse.ok) {
      const uploadData = await uploadResponse.json();
      console.log('✅ Upload successful!');
      console.log(`🌐 File URL: ${uploadData.data.url}`);
      console.log(`🆔 UUID: ${uploadData.data.uuid}`);
      console.log(`📊 Provider: ${uploadData.data.provider}`);
      
      // Test 3: Image transformations
      console.log('\n3️⃣ Testing image transformations...');
      const transformations = [
        { name: 'Resize 300x300', url: `${uploadData.data.url}-/resize/300x300/` },
        { name: 'Preview 100x100', url: `${uploadData.data.url}-/preview/100x100/` },
        { name: 'Format WebP', url: `${uploadData.data.url}-/format/webp/` },
        { name: 'Grayscale', url: `${uploadData.data.url}-/grayscale/` }
      ];
      
      for (const transform of transformations) {
        console.log(`🔄 ${transform.name}: ${transform.url}`);
      }
      
      // Test 4: Delete the file
      console.log('\n4️⃣ Testing file deletion...');
      const deleteResponse = await fetch(`${baseUrl}/api/v1/upload/uploadcare/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': testApiKey
        },
        body: JSON.stringify({
          fileUrl: uploadData.data.url,
          uuid: uploadData.data.uuid
        })
      });

      if (deleteResponse.ok) {
        const deleteData = await deleteResponse.json();
        console.log('✅ Delete successful!');
        console.log(`🗑️ Deleted UUID: ${deleteData.data.uuid}`);
      } else {
        const errorData = await deleteResponse.json();
        console.log('❌ Delete failed:', errorData.message);
      }
      
    } else {
      const errorData = await uploadResponse.json();
      console.log('❌ Upload failed:', errorData.message);
      if (errorData.details) {
        console.log('📝 Details:', errorData.details);
      }
    }
    console.log('');

    console.log('🎉 Uploadcare integration test completed!');

  } catch (error) {
    console.error('💥 Test error:', error.message);
  }
}

// Run the test
testUploadcareWithAuth();
