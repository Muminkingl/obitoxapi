// 🚀 ObitoX SDK Progress Tracking Demo
// This shows how developers can implement real-time upload progress!

import ObitoX from './dist/index.esm.js';

async function demoProgressTracking() {
  console.log('🎯 ObitoX SDK Progress Tracking Demo\n');
  
  // Initialize SDK
  const obitox = new ObitoX({
    apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
    baseUrl: 'http://localhost:5500'
  });
  
  // Create a demo file (in real usage, this would be user's file)
  const demoContent = 'Hello World! '.repeat(1000); // ~13KB file
  const demoFile = new File([demoContent], 'demo.txt', { type: 'text/plain' });
  
  console.log(`📁 Demo file: ${demoFile.name} (${(demoFile.size / 1024).toFixed(1)} KB)`);
  console.log('🚀 Starting upload with progress tracking...\n');
  
  // Progress tracking callback - this is what developers implement!
  const onProgress = (progress, bytesUploaded, totalBytes) => {
    // Create a visual progress bar
    const barLength = 30;
    const filledLength = Math.floor((progress / 100) * barLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    // Format file sizes
    const uploadedKB = (bytesUploaded / 1024).toFixed(1);
    const totalKB = (totalBytes / 1024).toFixed(1);
    
    // Calculate upload speed (simple estimation)
    const speed = (bytesUploaded / 1024).toFixed(1);
    
    // Display progress with emojis and colors
    process.stdout.write(`\r📊 ${progressBar} ${progress.toFixed(1).padStart(5)}% | 📤 ${uploadedKB}KB/${totalKB}KB | 🚀 ${speed}KB/s`);
    
    // Show completion message
    if (progress >= 100) {
      console.log('\n\n🎉 Upload completed successfully!');
    }
  };
  
  try {
    // Upload with progress tracking - just ONE line of code!
    const fileUrl = await obitox.uploadFile(demoFile, {
      provider: 'VERCEL',
      vercelToken: 'vercel_blob_rw_9FeG3HqA5XI6Jdus_hPSNv6Rx8R3eoSQyRnUcPSEv2YEzZ6',
      onProgress: onProgress // 🔥 This is the magic!
    });
    
    console.log(`\n✅ File uploaded successfully!`);
    console.log(`🌐 URL: ${fileUrl}`);
    
    // Test the uploaded file
    const response = await fetch(fileUrl);
    if (response.ok) {
      console.log(`🔍 File accessible - Status: ${response.status}`);
    }
    
  } catch (error) {
    console.error(`\n❌ Upload failed: ${error.message}`);
  }
  
  console.log('\n🎯 Demo completed!');
  console.log('\n💡 Key Benefits of Progress Tracking:');
  console.log('   • Real-time upload progress (0% to 100%)');
  console.log('   • Visual progress bars for better UX');
  console.log('   • Upload speed monitoring');
  console.log('   • File size tracking');
  console.log('   • Better user experience for large files');
  console.log('   • Professional upload interfaces');
}

// Run the demo
demoProgressTracking();
