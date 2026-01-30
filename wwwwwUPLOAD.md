### Upload care Documentation 



const UPLOADCARE_PUBLIC_KEY = process.env.UPLOADCARE_PUBLIC_KEY || '161fe6bb917ca422b3c0';
const UPLOADCARE_SECRET_KEY = process.env.UPLOADCARE_SECRET_KEY || '1e1be49777715a657cb4';


For the test use this  try {
        // Create a minimal 1x1 pixel PNG image (valid image for Uploadcare)
        // PNG signature + minimal IHDR chunk for 1x1 white pixel
        const pngData = new Uint8Array([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color, compression, filter, interlace, CRC
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, // compressed image data (white pixel)
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59, // CRC
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82                     // CRC
        ]);

        const filename = `uploadcare-sdk-test-${Date.now()}.png`;
        const file = new File([pngData], filename, { type: 'image/png' });



becuase free tire only allow image upload thats why 



Upload with optimize `import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  imageOptimization: {
    auto: true  // ✅ Auto WebP + Smart compression
  }
});

console.log('Optimized URL:', url);`




Basic upload ; `const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY
});

// https://ucarecdn.com/uuid/photo.jpg`




 Automatically convert to WebP/AVIF and optimize quality  ; `const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  imageOptimization: {
     auto: true  // WebP + smart quality + progressive!
  }
});`



Fine-tune compression and format setting ; ` const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  imageOptimization: {
    format: 'webp',
    quality: 'best',
    progressive: true,
    stripMeta: 'sensitive',
    adaptiveQuality: true  // AI-powered quality
  }
});` 

Automatically detect and remove infected files; `try {
  const url = await client.uploadFile(file, {
    provider: 'UPLOADCARE',
    uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
    uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
    checkVirus: true  // Auto-scan for viruses
  });
  
  console.log('✅ File is clean:', url);
} catch (error) {
  // File was infected and deleted
  console.error('🦠 Virus detected:', error.message);
}`


Publicly accessible CDN link ; `const downloadUrl = await client.downloadFile({
  provider: 'UPLOADCARE',
  fileUrl: 'https://ucarecdn.com/uuid/photo.jpg',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY
});`


Delete file ; `await client.deleteFile({
  provider: 'UPLOADCARE',
  fileUrl: 'https://ucarecdn.com/uuid/photo.jpg',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY
});`


Progress tracking ; `const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  
  onProgress: (progress, bytesUploaded, totalBytes) => {
    console.log(`${progress.toFixed(1)}% uploaded`);
    // Browser: 0% → 15% → 32% → 58% → 100%
    // Node.js: 0% → 100%
  },
  
  onCancel: () => console.log('Upload cancelled')
});`


Progress with React ; `const [progress, setProgress] = useState(0);

const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  
  onProgress: (percent) => setProgress(percent)
});

// In JSX: <ProgressBar value={progress} />`

