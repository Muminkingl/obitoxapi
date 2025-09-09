// Test file listing functionality with Uploadcare
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Test list functionality with Uploadcare
async function testList() {
  try {
    console.log('📋 Testing ObitoX List Functionality with Uploadcare...');
    
    const fileList = await obitox.listFiles({
      provider: 'UPLOADCARE',
      uploadcarePublicKey: 'fd3e8b8a0db4d01d312b',
      uploadcareSecretKey: '96569e37346814148acf',
      limit: 10, // Optional: limit number of files
      offset: 0  // Optional: pagination offset
    });
    
    console.log('✅ List successful!');
    console.log('📁 Total files:', fileList.total || fileList.files?.length || 0);
    
    if (fileList.files && fileList.files.length > 0) {
      console.log('\n📋 Files:');
      fileList.files.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.filename || file.name}`);
        console.log(`      Size: ${file.size || file.fileSize} bytes`);
        console.log(`      Type: ${file.type || file.contentType}`);
        console.log(`      URL: ${file.url || file.downloadUrl}`);
        console.log(`      Uploaded: ${file.uploadedAt || file.createdAt}`);
        console.log('');
      });
    } else {
      console.log('📁 No files found');
    }
    
  } catch (error) {
    console.error('❌ List failed:', error.message);
  }
}

// Run the test
testList();
