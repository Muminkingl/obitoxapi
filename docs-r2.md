# Cloudflare R2 Storage

> S3-compatible object storage with **ZERO egress fees** and lightning-fast performance

## Overview

Cloudflare R2 is S3-compatible object storage that eliminates egress bandwidth fees. Upload files at lightning speed (<50ms) with pure cryptographic signing, and pay zero for downloads.

**Key Killer Features:**
- **Zero egress fees** - Download bandwidth is FREE
- **Batch operations** - Upload 100 files in <500ms (5ms per file!)
- **S3-compatible** - Drop-in replacement for S3
- **JWT access tokens** - Enterprise-grade security

---

## Getting Started

### Prerequisites

1. **Cloudflare R2 API Tokens** - Create from [Cloudflare Dashboard → R2 → Manage R2 API Tokens](https://dash.cloudflare.com/)
   - Access Key ID: 20-128 characters
   - Secret Access Key: 32-128 characters
   
2. **R2 Bucket** - Create from [Cloudflare Dashboard → R2](https://dash.cloudflare.com/)
   - Bucket name: 3-63 characters, lowercase, alphanumeric
   
3. **Account ID** - Find in Cloudflare Dashboard → R2 (32 hex characters)

4. **ObitoX API Credentials**
   ```bash
   OBITOX_API_KEY=ox_xxxxxxxxxxxxxxxxxxxx
   OBITOX_API_SECRET=sk_xxxxxxxxxxxxxxxxxxxx
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
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log('Uploaded:', url);
// Output: https://pub-abc123.r2.dev/photo-xxxxx.jpg
```

### Batch Upload (Up to 100 Files!)

R2's killer feature - get signed URLs for 100 files in ONE API call:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const r2Provider = client.providers.get('R2');

// Step 1: Get signed URLs for all files at once
const result = await r2Provider.batchUpload({
  files: [
    { filename: 'photo1.jpg', contentType: 'image/jpeg', fileSize: 1024000 },
    { filename: 'photo2.jpg', contentType: 'image/jpeg', fileSize: 2048000 },
    { filename: 'photo3.jpg', contentType: 'image/jpeg', fileSize: 3072000 }
    // ... up to 100 files!
  ],
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log(`Generated ${result.total} URLs in ${result.performance.totalTime}`);
// Output: Generated 3 URLs in 12ms (4ms per file)

// Step 2: Upload all files in parallel
await Promise.all(
  actualFiles.map((file, i) =>
    fetch(result.urls[i].uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type }
    })
  )
);

console.log('All files uploaded!');
```

### Upload with Custom Domain

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  r2PublicUrl: 'https://cdn.myapp.com'  // Your custom domain
});

console.log(url);  // https://cdn.myapp.com/photo-xxxxx.jpg
```

---

## Delete Files

### Single Delete

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
await client.deleteFile({
  provider: 'R2',
  fileUrl: 'https://pub-abc123.r2.dev/photo-xxxxx.jpg',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});
```

### Batch Delete (Up to 1000 Files!)

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const r2Provider = client.providers.get('R2');

const result = await r2Provider.batchDelete({
  fileKeys: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],  // Up to 1000!
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});

console.log(`Deleted: ${result.deleted.length}, Failed: ${result.errors.length}`);
```

---

## Download & Signed URLs

### Generate Signed Download URL

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'R2',
  fileKey: 'photo-xxxxx.jpg',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  expiresIn: 3600  // 1 hour
});

console.log(downloadUrl);  // Valid for 1 hour
```

---

## Advanced Features

### JWT Access Tokens (Enterprise Security)

Generate time-limited, permission-scoped tokens for secure file access:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const r2Provider = client.providers.get('R2');

// Generate token for specific file
const token = await r2Provider.generateAccessToken({
  r2Bucket: 'private-docs',
  fileKey: 'confidential-report.pdf',
  permissions: ['read'],
  expiresIn: 3600  // 1 hour
});

console.log('Token:', token.token);
console.log('Expires:', token.expiresAt);

// Token usage in requests
// Authorization: Bearer <token.token>
```

**Token Permissions:**
- `read` - Download file
- `write` - Upload file
- `delete` - Delete file

### Revoke Access Token

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const r2Provider = client.providers.get('R2');

await r2Provider.revokeAccessToken(token.token);
console.log('Token revoked immediately');
```

### List Files in Bucket

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const r2Provider = client.providers.get('R2');

const result = await r2Provider.listFiles({
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  prefix: 'documents/',  // Optional: filter by folder
  maxKeys: 100           // Optional: limit results (default: 100, max: 1000)
});

console.log(`Found ${result.count} files`);
result.files.forEach(file => {
  console.log(`${file.key} - ${file.size} bytes`);
});

// Pagination
if (result.truncated) {
  const nextPage = await r2Provider.listFiles({
    r2AccessKey: process.env.R2_ACCESS_KEY,
    r2SecretKey: process.env.R2_SECRET_KEY,
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2Bucket: 'my-uploads',
    continuationToken: result.continuationToken
  
---
