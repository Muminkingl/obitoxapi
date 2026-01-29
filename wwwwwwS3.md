### S3 documentation 


Upload first file ; `import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

// Upload to S3 (3 lines!)
const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'myapp-uploads-2026',
  s3Region: 'us-east-1'
});

console.log('✅ Uploaded:', url);
// https://myapp-uploads-2026.s3.us-east-1.amazonaws.com/photo-xxxxx.jpg`




Basic upload ; `const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});

console.log('Uploaded:', url);
// https://my-uploads.s3.us-east-1.amazonaws.com/photo-xxxxx.jpg`




Smart cost optimization ; `const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3StorageClass: 'INTELLIGENT_TIERING'  // Auto-saves money! 💰
});`


AWS managed encryption ; `const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3EncryptionType: 'SSE-S3'  // Default, no extra cost
});`


Custom managed keys ; `const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3EncryptionType: 'SSE-KMS',
  s3KmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/...'
});`



Cloudfront cdn  ; `const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3CloudFrontDomain: 'cdn.myapp.com'  // Your CloudFront domain
});

// Returns CDN URL for blazing fast delivery
console.log(url); // https://cdn.myapp.com/photo-xxxxx.jpg`


Single delete; `await client.deleteFile({
  provider: 'S3',
  key: 'photo-xxxxx.jpg',  // S3 object key
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});

console.log('✅ Deleted!');`


Batch delete ; `const s3Provider = client.providers.get('S3');

await s3Provider.batchDelete({
  keys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],  // Up to 1000!
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});

console.log('✅ Deleted 3 files in one call');`


Generate signed url ; `const downloadUrl = await client.downloadFile({
  provider: 'S3',
  key: 'photo-xxxxx.jpg',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  expiresIn: 3600  // Valid for 1 hour
});

console.log(downloadUrl);  // Valid for 1 hour only`


Force download ; `const downloadUrl = await client.downloadFile({
  provider: 'S3',
  key: 'report.pdf',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  responseContentDisposition: 'attachment; filename="report.pdf"'
});

// Browser will download instead of opening`


List files ; `const s3Provider = client.providers.get('S3');

const result = await s3Provider.list({
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  prefix: 'documents/',  // Optional: filter by folder
  maxKeys: 100           // Optional: limit results (default: 1000)
});

console.log(`Found ${result.count} files`);
result.files.forEach(file => {
  console.log(`${file.key} - ${file.size} bytes`);
});

// Pagination
if (result.isTruncated) {
  const nextPage = await s3Provider.list({
    s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
    s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: 'my-uploads',
    s3Region: 'us-east-1',
    continuationToken: result.nextContinuationToken
  });
}`


GEt file metadtaa ; `const s3Provider = client.providers.get('S3');

const metadata = await s3Provider.getMetadata({
  key: 'photo-xxxxx.jpg',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});

console.log(`Size: ${metadata.metadata.sizeFormatted}`);
console.log(`Type: ${metadata.metadata.contentType}`);
console.log(`Last Modified: ${metadata.metadata.lastModified}`);
console.log(`Storage Class: ${metadata.metadata.storageClass}`);
console.log(`Encryption: ${metadata.metadata.encryption.serverSideEncryption}`);`



Multiple upload ; `const s3Provider = client.providers.get('S3');

const url = await s3Provider.multipartUpload(largeFile, {
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  partSize: 10485760  // 10MB parts (default)
});

console.log('✅ Large file uploaded:', url);`


