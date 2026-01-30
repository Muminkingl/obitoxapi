### Cloudflare R2 documentation 


Upload first file ; `import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

// Upload to R2
const url = await client.uploadFile(file, {
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log('Uploaded:', url);
// https://pub-abc123.r2.dev/photo-xxxxx.jpg`


Progress tracking ; `const url = await client.uploadFile(file, {
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  
  onProgress: (progress, bytesUploaded, totalBytes) => {
    console.log(`${progress.toFixed(1)}% uploaded`);
    // Browser: 0% → 15% → 32% → 58% → 100%
    // Node.js: 0% → 100%
  },
  
  onCancel: () => console.log('Cancelled')
});`


Basic upload ; `const url = await client.uploadFile(file, {
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log('Uploaded:', url);`


batch upload ; `const r2Provider = client.providers.get('R2');

// Step 1: Get signed URLs for all files at once
const result = await r2Provider.batchUpload({
  files: [
    { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
    { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 },
    // ... up to 100 files!
  ],
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log(`Generated ${result.total} URLs in ${result.performance.totalTime}`);
// Output: Generated 2 URLs in 12ms

// Step 2: Upload files in parallel using the URLs
// ...`


Custom domain ; `const url = await client.uploadFile(file, {
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  r2PublicUrl: 'https://cdn.myapp.com'  // Your custom domain
});

console.log(url);  // https://cdn.myapp.com/photo-xxxxx.jpg`



single delete ; `await client.deleteFile({
  provider: 'R2',
  fileUrl: 'https://pub-abc123.r2.dev/photo-xxxxx.jpg',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});`


batch delete ; `const r2Provider = client.providers.get('R2');

const result = await r2Provider.batchDelete({
  fileKeys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log(`Deleted: ${result.deleted.length}`);`



Download generate sgned url ; `const downloadUrl = await client.downloadFile({
  provider: 'R2',
  fileKey: 'photo-xxxxx.jpg',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  expiresIn: 3600  // Valid for 1 hour
});

console.log(downloadUrl);`


Jwt access toekn ; `const r2Provider = client.providers.get('R2');

// Generate token for specific file
const token = await r2Provider.generateAccessToken({
  r2Bucket: 'private-docs',
  fileKey: 'confidential-report.pdf',
  permissions: ['read'],
  expiresIn: 3600
});

console.log('Token:', token.token);

// Revoke anytime
await r2Provider.revokeAccessToken(token.token);`

List files; `const r2Provider = client.providers.get('R2');

const result = await r2Provider.listFiles({
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  prefix: 'documents/',
  maxKeys: 100
});

console.log(`Found ${result.count} files`);`

