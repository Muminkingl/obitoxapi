// Test valid file upload to see tracking in action
import ObitoX from './dist/index.esm.js';

async function testValidUpload() {
  console.log('🧪 Testing Valid File Upload for Enhanced Tracking...\n');
  
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });
    
    // Create a valid file with proper extension
    const fileContent = 'Hello from ObitoX SDK! This is a test file for tracking.';
    
    // Create a File object with a proper filename (this should pass validation)
    const file = new File([fileContent], 'test-document.txt', { type: 'text/plain' });
    
    console.log('📁 File details:');
    console.log('   📄 Content:', fileContent);
    console.log('   📏 Size:', file.size, 'bytes');
    console.log('   🏷️  Type: text/plain');
    console.log('   📝 Filename: test-document.txt');
    
    console.log('\n🚀 Attempting upload...');
    
    const fileUrl = await obitox.uploadFile(file, {
      provider: 'VERCEL',
      token: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
    });
    
    console.log('\n🎉 SUCCESS! File uploaded!');
    console.log('🌐 File URL:', fileUrl);
    console.log('✅ This should update the tracking metrics!');
    
    // Now check the updated tracking data
    console.log('\n📊 Checking updated tracking data...');
    const validation = await obitox.validate();
    console.log('Updated tracking:', JSON.stringify(validation.data.api_key, null, 2));
    
  } catch (error) {
    console.log('❌ Upload failed:', error.message);
    console.log('💡 This might be due to Vercel token validation or file requirements');
  }
}

testValidUpload();
