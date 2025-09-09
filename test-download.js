// Test file download functionality
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Test download functionality with Uploadcare
async function testDownload() {
  try {
    console.log('📥 Testing ObitoX Download Functionality with Uploadcare...');
    
    // Replace this with an Uploadcare file URL that exists
    const fileUrl = 'https://2jku2uh917.ucarecd.net/d01fa71e-b66b-423d-9fbb-64cbe5b5f999/testtt.jpg';
    
    console.log('📁 Downloading file:', fileUrl);
    
    const downloadInfo = await obitox.downloadFile({
      fileUrl: fileUrl,
      provider: 'UPLOADCARE',
      uploadcarePublicKey: 'fd3e8b8a0db4d01d312b',
      uploadcareSecretKey: '96569e37346814148acf'
    });
    
    console.log('📄 Download info:', {
      filename: downloadInfo.filename,
      downloadUrl: downloadInfo.downloadUrl,
      fileSize: downloadInfo.fileSize,
      contentType: downloadInfo.contentType,
      isPrivate: downloadInfo.isPrivate,
      provider: downloadInfo.provider
    });
    
    // You can now use downloadInfo.downloadUrl to download the file
    console.log('\n🔗 Direct download URL:', downloadInfo.downloadUrl);
    console.log('💡 You can open this URL in your browser or use it in your app');
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
  }
}

// Run the test
testDownload();
