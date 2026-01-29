# Amazon S3 Storage

> Enterprise-grade object storage with 11 9's durability and 27 global regions

## Overview

Amazon S3 is AWS's flagship object storage service, offering unmatched reliability, global reach, and advanced features like versioning, encryption, and intelligent storage tiering.

---

## Getting Started

### Prerequisites

1. **AWS IAM Credentials** - Create from [AWS Console → IAM → Users → Security Credentials](https://console.aws.amazon.com/iam)
   - Access Key ID: `AKIA...` (20 characters)
   - Secret Access Key: `wJalr...` (40 characters)
   
2. **S3 Bucket** - Create from [S3 Console](https://s3.console.aws.amazon.com/)
   - Must be globally unique (3-63 characters)
   - Lowercase, alphanumeric with hyphens

3. **ObitoX API Credentials**
   ```bash
   OBITOX_API_KEY=ox_xxxxxxxxxxxxxxxxxxxx
   OBIT OX_API_SECRET=sk_xxxxxxxxxxxxxxxxxxxx
   ```

---

## Upload Features

### Basic Upload

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

// Upload file
const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});

console.log('Uploaded:', url);
// Output: https://my-uploads.s3.us-east-1.amazonaws.com/photo-xxxxx.jpg
```

### Upload with Storage Class (Cost Optimization)

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3StorageClass: 'INTELLIGENT_TIERING'  // Auto-optimizes costs!
});
```

**Storage Classes:**
- `STANDARD` - General purpose (default)
- `INTELLIGENT_TIERING` - Auto-optimization based on access
- `STANDARD_IA` - Infrequent access (cheaper)
- `GLACIER_INSTANT_RETRIEVAL` - Archive with instant access
- `GLACIER_FLEXIBLE_RETRIEVAL` - Archive (1-5 min retrieval)
- `GLACIER_DEEP_ARCHIVE` - Lowest cost (12-hour retrieval)

### Upload with Encryption

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
// AWS-managed encryption (free)
const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3EncryptionType: 'SSE-S3'  // Default
});

// Customer-managed encryption (KMS)
const url2 = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3EncryptionType: 'SSE-KMS',
  s3KmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/...'
});
```

### Upload with CloudFront CDN

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'S3',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  s3CloudFrontDomain: 'cdn.myapp.com'
});

// Returns CloudFront URL for faster delivery
console.log(url); // https://cdn.myapp.com/photo-xxxxx.jpg
```

---

## Delete Files

### Single Delete

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
await client.deleteFile({
  provider: 'S3',
  key: 'photo-xxxxx.jpg',  // S3 object key
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});
```

### Batch Delete (Up to 1000 Files)

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const s3Provider = client.providers.get('S3');

await s3Provider.batchDelete({
  keys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],  // Up to 1000!
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1'
});

console.log('✅ Deleted 3 files in one call');
```

---

## Download & Signed URLs

### Generate Signed Download URL

S3 files can be private - use signed URLs for secure access:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'S3',
  key: 'photo-xxxxx.jpg',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  expiresIn: 3600  // 1 hour
});

console.log(downloadUrl);  // Valid for 1 hour
```

### Force Download (vs Display in Browser)

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'S3',
  key: 'report.pdf',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  responseContentDisposition: 'attachment; filename="report.pdf"'
});
```

---

## Advanced Features

### List Files in Bucket

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const s3Provider = client.providers.get('S3');

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
}
```

### Get File Metadata (Without Downloading)

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const s3Provider = client.providers.get('S3');

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
console.log(`Encryption: ${metadata.metadata.encryption.serverSideEncryption}`);
```

### Multipart Upload (Files > 100MB)

For large files, use multipart upload:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const s3Provider = client.providers.get('S3');

const url = await s3Provider.multipartUpload(largeFile, {
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3Bucket: 'my-uploads',
  s3Region: 'us-east-1',
  partSize: 10485760  // 10MB parts (default)
});
```

---

## AWS Regions

S3 is available in **27 AWS regions**:

**North America:**
`us-east-1`, `us-east-2`, `us-west-1`, `us-west-2`, `ca-central-1`

**Europe:**
`eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-central-1`, `eu-north-1`, `eu-south-1`, `eu-south-2`

**Asia Pacific:**
`ap-south-1`, `ap-south-2`, `ap-southeast-1`, `ap-southeast-2`, `ap-southeast-3`, `ap-southeast-4`, `ap-northeast-1`, `ap-northeast-2`, `ap-northeast-3`, `ap-east-1`

**Middle East:**
`me-south-1`, `me-central-1`, `il-central-1`

**South America:**
`sa-east-1`

**Africa:**
`af-south-1`

---

## Next Steps

- [Cloudflare R2](/docs/providers/r2) - Zero egress fees
- [Vercel Blob](/docs/providers/vercel) - Simple edge storage
- [Uploadcare](/docs/providers/uploadcare) - Image transformation
