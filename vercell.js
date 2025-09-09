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

// Test upload with Uploadcare
async function testUpload() {
  try {
    console.log('🚀 Testing ObitoX SDK with Uploadcare...');
    
    const fileUrl = await obitox.uploadFile(file, {
      provider: 'UPLOADCARE',
      uploadcarePublicKey: 'fd3e8b8a0db4d01d312b',
      uploadcareSecretKey: '96569e37346814148acf',
      onProgress: (progress) => {
        console.log(`Upload progress: ${progress.toFixed(1)}%`);
      }
    });
    

    console.log('📁 File URL:', fileUrl);
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  }
}

// Run the test
testUpload();
