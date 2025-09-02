// ObitoX SDK Test - Testing Provider System!
const ObitoX = require('./dist/index.js').default;
const fs = require('fs');

const obitox = new ObitoX({
  apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
  baseUrl: 'http://localhost:5500'
});

async function testProviderSystem() {
  try {
    console.log('🧪 Testing ObitoX SDK with Provider System...\n');
    
    // Read the test.json file
    const jsonData = fs.readFileSync('test.json', 'utf8');
    console.log('📁 test.json content:', jsonData);
    
    // Create Blob from JSON data
    const file = new Blob([jsonData], { type: 'application/json' });
    console.log('📁 File size:', file.size, 'bytes');
    
    console.log('\n🚀 Testing upload with Provider System...');
    
    // THE MAGIC LINE! Upload with provider and token!
    const fileUrl = await obitox.uploadFile(file, {
      provider: 'VERCEL',
      token: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6'
    });
    
    console.log('\n🎉 SUCCESS! test.json uploaded!');
    console.log('🌐 File URL:', fileUrl);
    
    // Test if file is accessible
    console.log('\n🔍 Testing file accessibility...');
    const fileCheckResponse = await fetch(fileUrl);
    console.log('   Status:', fileCheckResponse.status);
    
    if (fileCheckResponse.ok) {
      const downloadedContent = await fileCheckResponse.text();
      console.log('✅ File is accessible and working!');
      console.log('📄 Downloaded content:', downloadedContent);
      console.log('✅ Your ObitoX SDK Provider System is working!');
      console.log('✅ Ready for AWS, Cloudinary, etc.!');
    } else {
      console.log('❌ File not accessible:', fileCheckResponse.statusText);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testProviderSystem();