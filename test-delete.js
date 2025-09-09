// Test file deletion functionality
import { ObitoX } from './dist/index.esm.js';

// Initialize ObitoX
const obitox = new ObitoX({
  apiKey: 'ox_ce5716a92d3705afc3f4195c3b77957413b900c99e7d0fd9c2031f0935dd86f9'
});

// Test delete functionality with Uploadcare
async function testDelete() {
  try {
    console.log('🗑️ Testing ObitoX Delete Functionality with Uploadcare...');
    
    // Replace this with the Uploadcare file URL you want to delete
    const fileUrl = 'https://2jku2uh917.ucarecd.net/d01fa71e-b66b-423d-9fbb-64cbe5b5f999/testtt.jpg';
    
    const deleted = await obitox.deleteFile({
      fileUrl: fileUrl,
      provider: 'UPLOADCARE',
      uploadcarePublicKey: 'fd3e8b8a0db4d01d312b',
      uploadcareSecretKey: '96569e37346814148acf'
    });
    
    console.log('✅ Delete successful!');
    console.log('🗑️ Deletion result:', deleted);
    
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
  }
}

// Run the test
testDelete();
