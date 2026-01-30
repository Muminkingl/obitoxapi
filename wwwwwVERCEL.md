### Vercel Blob Documentation 


Upload file ; `import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

const url = await client.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: process.env.VERCEL_BLOB_TOKEN
});

console.log('Uploaded:', url);
// https://xxx.public.blob.vercel-storage.com/photo-xxxxx.jpg`


Progress tracking ; `const url = await client.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: process.env.VERCEL_BLOB_TOKEN,
  
  onProgress: (progress, bytesUploaded, totalBytes) => {
    console.log(`${progress.toFixed(1)}% uploaded`);
    // Reports 0% → 100% (Vercel SDK limitation)
  },
  
  onCancel: () => console.log('Upload cancelled')
});`


Delete file ; `await client.deleteFile({
  provider: 'VERCEL',
  fileUrl: 'https://xxx.public.blob.vercel-storage.com/photo.jpg',
  vercelToken: process.env.VERCEL_BLOB_TOKEN
});`


Download file ; `const downloadUrl = await client.downloadFile({
  provider: 'VERCEL',
  fileUrl: 'https://xxx.public.blob.vercel-storage.com/photo.jpg'
});

// Vercel Blob URLs are public by default`

