# Vercel Blob Storage

> Upload files to Vercel Blob with automatic global CDN distribution

## Overview

Vercel Blob is a simple, scalable object storage solution with automatic edge caching. Files uploaded to Vercel Blob are instantly available worldwide through Vercel's global CDN.

### When to Use Vercel Blob

- ✅ **Next.js/Vercel projects** - Native integration
- ✅ **Public assets** - Images, videos, documents  
- ✅ **Fast global delivery** - Automatic CDN distribution
- ✅ **Small to medium files** - Up to 100MB per file

### Key Benefits

- **Zero bandwidth cost** - Direct upload from client to Vercel
- **Global CDN** - Instant worldwide distribution
- **Public by default** - No signed URLs needed for access
- **Simple API** - Easy integration with `@vercel/blob`

---

## Getting Started

### Prerequisites

1. **Vercel Blob Token** - Get from [Vercel Dashboard](https://vercel.com/dashboard/stores)
   - Format: `vercel_blob_rw_xxxxx...`
   - Requires read/write permissions

2. **ObitoX API Credentials**
   ```bash
   OBITOX_API_KEY=ox_xxxxxxxxxxxxxxxxxxxx
   OBITOX_API_SECRET=sk_xxxxxxxxxxxxxxxxxxxx  # Optional but recommended
   ```

### Basic Upload

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

// Upload file
const url = await client.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: process.env.VERCEL_BLOB_TOKEN
});

console.log('Uploaded:', url);
// Output: https://xxx.public.blob.vercel-storage.com/photo.jpg
```

---

## Upload Features

### Basic Upload

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_xxx...'
});
```

> **Note:** Vercel Blob uploads **do not support progress tracking or cancellation** because files upload directly to Vercel (bypassing ObitoX), and the `@vercel/blob` SDK doesn't expose these features. Use a simple loading spinner for UX feedback.

### React Upload Example

```tsx theme={"theme":{"light":"github-light","dark":"vesper"}}
import { useState } from 'react';
import ObitoX from 'obitox';

function FileUploader() {
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState('');

  const handleUpload = async (file: File) => {
    const client = new ObitoX({ apiKey: process.env.NEXT_PUBLIC_OBITOX_API_KEY });
    
    const fileUrl = await client.uploadFile(file, {
      provider: 'VERCEL',
      vercelToken: process.env.NEXT_PUBLIC_VERCEL_BLOB_TOKEN,
      onProgress: (p) => setProgress(p)
    });
    
    setUrl(fileUrl);
  };

  return (
    <div>
      <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />
      {progress > 0 && <progress value={progress} max={100} />}
      {url && <img src={url} alt="Uploaded" />}
    </div>
  );
}
```

---

## Delete Files

### Basic Delete

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
await client.deleteFile({
  provider: 'VERCEL',
  fileUrl: 'https://xxx.public.blob.vercel-storage.com/photo.jpg',
  vercelToken: process.env.VERCEL_BLOB_TOKEN
});

console.log('File deleted');
```

### Delete with Error Handling

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
try {
  await client.deleteFile({
    provider: 'VERCEL',
    fileUrl: url,
    vercelToken: process.env.VERCEL_BLOB_TOKEN
  });
  console.log('✅ Deleted successfully');
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('⚠️ Delete timed out (30s) - may complete in background');
  } else {
    console.error('❌ Delete failed:', error.message);
  }
}
```

### Batch Delete Pattern

Delete multiple files sequentially:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const urls = [
  'https://xxx.public.blob.vercel-storage.com/photo1.jpg',
  'https://xxx.public.blob.vercel-storage.com/photo2.jpg',
  'https://xxx.public.blob.vercel-storage.com/photo3.jpg'
];

for (const url of urls) {
  try {
    await client.deleteFile({
      provider: 'VERCEL',
      fileUrl: url,
      vercelToken: process.env.VERCEL_BLOB_TOKEN
    });
    console.log(`✅ Deleted: ${url}`);
  } catch (error) {
    console.error(`❌ Failed: ${url}`, error.message);
  }
}
```

---

## Download & CDN Access

### Direct URL Access

Vercel Blob files are **public by default** - no signed URLs needed:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'VERCEL',
  fileUrl: 'https://xxx.public.blob.vercel-storage.com/photo.jpg',
  vercelToken: process.env.VERCEL_BLOB_TOKEN
});

// downloadUrl === fileUrl (same URL)
console.log(downloadUrl);
```

### Browser Download

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
// Direct download in browser
window.open(fileUrl, '_blank');

// Or programmatic download
const response = await fetch(fileUrl);
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'photo.jpg';
a.click();
```

### Server-Side Download

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
import fs from 'fs';

const response = await fetch(fileUrl);
const buffer = await response.arrayBuffer();
fs.writeFileSync('downloaded.jpg', Buffer.from(buffer));
```

---

## TypeScript Support

### Import Types

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
import ObitoX from 'obitox';
import type {
  VercelUploadOptions,
  VercelDeleteOptions,
  VercelDownloadOptions,
  VercelBlobResponse
} from 'obitox';
```

### Typed Upload

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const options: VercelUploadOptions = {
  provider: 'VERCEL',
  vercelToken: process.env.VERCEL_BLOB_TOKEN!,
  filename: 'avatar.jpg',
  contentType: 'image/jpeg',
  onProgress: (progress, uploaded, total) => {
    console.log(`${progress}%`);
  }
};

const url: string = await client.uploadFile(file, options);
```

---

## Configuration & Limits

### File Limits

| Limit | Value |
|-------|-------|
| **Max file size** | 100 MB per file |
| **Allowed types** | Images, PDFs, videos, audio, documents |
| **Upload timeout** | 60 seconds |
| **Delete timeout** | 30 seconds |

### Allowed File Types

```ts
'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
'application/pdf', 'text/plain', 'application/json', 'text/csv'
'application/zip', 'video/mp4', 'audio/mpeg', 'audio/wav'
```

---

## Error Handling

### Common Errors

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
try {
  const url = await client.uploadFile(file, {
    provider: 'VERCEL',
    vercelToken: 'invalid-token'
  });
} catch (error) {
  if (error.message.includes('INVALID_TOKEN_FORMAT')) {
    console.error('❌ Invalid Vercel token format');
  } else if (error.message.includes('QUOTA_EXCEEDED')) {
    console.error('❌ Monthly quota exceeded');
  } else if (error.message.includes('Upload cancelled')) {
    console.error('⚠️ Upload was cancelled by user');
  } else {
    console.error('❌ Upload failed:', error.message);
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TOKEN_FORMAT` | Token doesn't match `vercel_blob_rw_*` format |
| `QUOTA_EXCEEDED` | Monthly API request limit reached |
| `INVALID_FILE` | File type or size not allowed |
| `DELETE_TIMEOUT` | Delete operation exceeded 30s timeout |
| `UPLOAD_CANCELLED` | Upload cancelled by AbortController |

---

## Best Practices

### 1. Environment Variables

Never hardcode tokens - use environment variables:

```bash
# .env.local
VERCEL_BLOB_TOKEN=vercel_blob_rw_xxxxx...
OBITOX_API_KEY=ox_xxxxx...
OBITOX_API_SECRET=sk_xxxxx...
```

### 2. Error Handling

Always wrap operations in try-catch:

```ts
try {
  const url = await client.uploadFile(file, options);
} catch (error) {
  // Handle error gracefully
  console.error('Upload failed:', error.message);
}
```

### 3. Progress Feedback

Provide visual feedback for better UX:

```ts
onProgress: (progress) => {
  // Update UI progress bar
  setUploadProgress(progress);
}
```

### 4. File Validation

Validate files before upload:

```ts
if (file.size > 100 * 1024 * 1024) {
  alert('File too large! Max 100MB');
  return;
}

if (!file.type.startsWith('image/')) {
  alert('Only images allowed');
  return;
}
```

---

## Next Steps

- [Amazon S3](/docs/providers/s3) - Private storage with versioning
- [Cloudflare R2](/docs/providers/r2) - Zero egress fees
- [Uploadcare](/docs/providers/uploadcare) - Image transformation & CDN
