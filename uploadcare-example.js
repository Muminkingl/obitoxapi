import { ObitoX } from './dist/index.js';
import fs from 'fs';

// Example usage of Uploadcare provider
async function uploadcareExample() {
  // Initialize the ObitoX client
  const client = new ObitoX({
    apiKey: 'your-api-key-here', // Replace with your actual API key
    baseUrl: 'http://localhost:3000' // Adjust if your server runs on a different port
  });

  try {
    console.log('🚀 Uploadcare Provider Example');
    console.log('=============================\n');

    // Example 1: Upload an image file
    console.log('📤 Example 1: Uploading an image...');
    
    // Read a test image file
    const imagePath = './testtt.jpg';
    if (!fs.existsSync(imagePath)) {
      console.error('❌ Test image not found. Please ensure testtt.jpg exists.');
      return;
    }
    
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
    
    // Upload to Uploadcare
    const fileUrl = await client.uploadFile(imageBlob, {
      provider: 'UPLOADCARE',
      onProgress: (progress, bytesUploaded, totalBytes) => {
        console.log(`📊 Upload progress: ${progress.toFixed(1)}% (${bytesUploaded}/${totalBytes} bytes)`);
      }
    });
    
    console.log('✅ Upload successful!');
    console.log(`🌐 File URL: ${fileUrl}`);
    console.log('');

    // Example 2: Test image transformations
    console.log('🎨 Example 2: Image transformations...');
    const transformations = [
      { name: 'Original', url: fileUrl },
      { name: 'Resize 300x300', url: `${fileUrl}-/resize/300x300/` },
      { name: 'Preview 100x100', url: `${fileUrl}-/preview/100x100/` },
      { name: 'Format WebP', url: `${fileUrl}-/format/webp/` },
      { name: 'Grayscale', url: `${fileUrl}-/grayscale/` },
      { name: 'Blur', url: `${fileUrl}-/blur/5/` }
    ];
    
    for (const transform of transformations) {
      console.log(`🔄 ${transform.name}: ${transform.url}`);
    }
    console.log('');

    // Example 3: Delete the file
    console.log('🗑️ Example 3: Deleting the file...');
    const deleteSuccess = await client.deleteFile({
      provider: 'UPLOADCARE',
      fileUrl: fileUrl
    });
    
    if (deleteSuccess) {
      console.log('✅ File deleted successfully!');
    } else {
      console.log('❌ Failed to delete file');
    }
    console.log('');

    // Example 4: Health check
    console.log('🏥 Example 4: Health check...');
    const isHealthy = await client.checkHealth('uploadcare');
    console.log(`📊 Uploadcare health: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log('');

    console.log('🎉 All examples completed!');

  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Example of using Uploadcare with different file types
async function uploadcareFileTypesExample() {
  const client = new ObitoX({
    apiKey: 'your-api-key-here',
    baseUrl: 'http://localhost:3000'
  });

  console.log('\n📁 Uploadcare File Types Example');
  console.log('=================================\n');

  // Example file types that Uploadcare supports
  const fileExamples = [
    { name: 'document.pdf', type: 'application/pdf', content: 'PDF content here' },
    { name: 'data.json', type: 'application/json', content: JSON.stringify({ test: 'data' }) },
    { name: 'text.txt', type: 'text/plain', content: 'Hello, Uploadcare!' },
    { name: 'archive.zip', type: 'application/zip', content: 'ZIP content here' }
  ];

  for (const fileExample of fileExamples) {
    try {
      console.log(`📤 Uploading ${fileExample.name}...`);
      
      const fileBlob = new Blob([fileExample.content], { type: fileExample.type });
      
      const fileUrl = await client.uploadFile(fileBlob, {
        provider: 'UPLOADCARE'
      });
      
      console.log(`✅ ${fileExample.name} uploaded: ${fileUrl}`);
      
      // Clean up
      await client.deleteFile({
        provider: 'UPLOADCARE',
        fileUrl: fileUrl
      });
      
      console.log(`🗑️ ${fileExample.name} deleted\n`);
      
    } catch (error) {
      console.error(`❌ Failed to upload ${fileExample.name}:`, error.message);
    }
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  uploadcareExample()
    .then(() => uploadcareFileTypesExample())
    .catch(console.error);
}

export { uploadcareExample, uploadcareFileTypesExample };
