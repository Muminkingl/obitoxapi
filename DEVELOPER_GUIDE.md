# 🚀 ObitoX File Upload SDK - Developer Guide

## 📋 Overview

ObitoX is a powerful file upload SDK that supports multiple cloud storage providers with **zero bandwidth cost** architecture. Developers provide their own storage credentials, and files upload directly to their storage - your server never handles the actual file data.

## 🏗️ Architecture

```
Developer → Your API (API Key) → Developer's Storage (Their Credentials)
   ↓           ↓                        ↓
Authentication  Rate Limiting      Direct Upload
Analytics       Validation         Zero Bandwidth Cost
```

## 🔑 Setup

### 1. Install the SDK

```bash
npm install @obitox/upload
```

### 2. Initialize ObitoX

```javascript
import { ObitoX } from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'ox_your_api_key_here',
  baseUrl: 'https://api.obitox.com' // or your custom endpoint
});
```

## 🪣 Supported Providers

### ✅ Currently Supported
- **Vercel Blob** - Fast, global CDN
- **Supabase Storage** - PostgreSQL-based storage with RLS

### 🔄 Coming Soon
- **AWS S3** - Industry standard
- **Cloudinary** - Image optimization

## 📚 Usage Examples

### 🪣 Supabase Storage

#### Setup Your Supabase Credentials

```javascript
// Your Supabase project credentials
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Service role key
```

#### List Available Buckets

```javascript
const buckets = await obitox.listBuckets({
  provider: 'SUPABASE',
  supabaseToken: SUPABASE_TOKEN,
  supabaseUrl: SUPABASE_URL
});

console.log('Available buckets:', buckets);
// Output: [
//   { name: 'test', public: true, fileCount: 5, totalSize: 1024000 },
//   { name: 'admin', public: false, fileCount: 2, totalSize: 512000 }
// ]
```

#### Upload to Specific Bucket

```javascript
const file = new File(['Hello World!'], 'hello.txt', { type: 'text/plain' });

const fileUrl = await obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: SUPABASE_TOKEN,
  supabaseUrl: SUPABASE_URL,
  bucket: 'test', // Specify which bucket to use
  onProgress: (progress, bytesUploaded, totalBytes) => {
    console.log(`Upload progress: ${progress.toFixed(1)}%`);
    console.log(`Uploaded: ${bytesUploaded} / ${totalBytes} bytes`);
  }
});

console.log('File uploaded:', fileUrl);
```

#### Download from Bucket

```javascript
// Download from public bucket (direct URL)
const download = await obitox.downloadFile({
  fileUrl: 'https://your-project.supabase.co/storage/v1/object/public/test/file.txt',
  provider: 'SUPABASE',
  supabaseToken: SUPABASE_TOKEN,
  supabaseUrl: SUPABASE_URL,
  bucket: 'test'
});

console.log('Download URL:', download.downloadUrl);
console.log('Is private:', download.isPrivate); // false for public buckets
```

#### Delete from Bucket

```javascript
const deleted = await obitox.deleteFile({
  fileUrl: 'https://your-project.supabase.co/storage/v1/object/public/test/file.txt',
  provider: 'SUPABASE',
  supabaseToken: SUPABASE_TOKEN,
  supabaseUrl: SUPABASE_URL,
  bucket: 'test'
});

console.log('File deleted:', deleted); // true/false
```

### ⚡ Vercel Blob

#### Upload to Vercel Blob

```javascript
const file = new File(['Hello World!'], 'hello.txt', { type: 'text/plain' });

const fileUrl = await obitox.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here',
  onProgress: (progress) => {
    console.log(`Upload progress: ${progress.toFixed(1)}%`);
  }
});

console.log('File uploaded:', fileUrl);
```

#### Delete from Vercel Blob

```javascript
const deleted = await obitox.deleteFile({
  fileUrl: 'https://blob.vercel-storage.com/your-file.txt',
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here'
});

console.log('File deleted:', deleted);
```

## 🎯 Advanced Features

### Progress Tracking

```javascript
const file = new File([largeData], 'large-file.zip', { type: 'application/zip' });

await obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: SUPABASE_TOKEN,
  supabaseUrl: SUPABASE_URL,
  bucket: 'uploads',
  onProgress: (progress, bytesUploaded, totalBytes) => {
    const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
    console.log(`\r📊 ${progressBar} ${progress.toFixed(1)}% (${bytesUploaded}/${totalBytes} bytes)`);
  }
});
```

### Upload Cancellation

```javascript
const file = new File([largeData], 'large-file.zip', { type: 'application/zip' });

// Start upload
const uploadPromise = obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: SUPABASE_TOKEN,
  supabaseUrl: SUPABASE_URL,
  bucket: 'uploads',
  onCancel: () => {
    console.log('Upload cancelled by user');
  }
});

// Cancel after 5 seconds
setTimeout(() => {
  obitox.cancelUpload({
    uploadId: 'upload-123',
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'uploads'
  });
}, 5000);

try {
  const result = await uploadPromise;
  console.log('Upload completed:', result);
} catch (error) {
  if (error.message.includes('cancelled')) {
    console.log('Upload was cancelled');
  }
}
```

## 🛡️ Error Handling

```javascript
try {
  const fileUrl = await obitox.uploadFile(file, {
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'test'
  });
  
  console.log('Success:', fileUrl);
} catch (error) {
  switch (error.message) {
    case 'HTTP 401: Unauthorized':
      console.error('Invalid API key');
      break;
    case 'MISSING_SUPABASE_TOKEN':
      console.error('Please provide your Supabase service key');
      break;
    case 'MISSING_SUPABASE_URL':
      console.error('Please provide your Supabase project URL');
      break;
    case 'BUCKET_ACCESS_DENIED':
      console.error('You don\'t have access to this bucket');
      break;
    default:
      console.error('Upload failed:', error.message);
  }
}
```

## 📊 Multi-Bucket Workflow Example

```javascript
// Complete workflow for managing files across multiple buckets
async function manageFiles() {
  // 1. List all available buckets
  const buckets = await obitox.listBuckets({
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL
  });

  console.log('Available buckets:', buckets.map(b => `${b.name} (${b.public ? 'Public' : 'Private'})`));

  // 2. Upload to public bucket for user uploads
  const userFile = new File(['User content'], 'user-upload.txt', { type: 'text/plain' });
  const userFileUrl = await obitox.uploadFile(userFile, {
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'public-uploads' // Public bucket
  });

  // 3. Upload to private bucket for admin files
  const adminFile = new File(['Admin content'], 'admin-doc.txt', { type: 'text/plain' });
  const adminFileUrl = await obitox.uploadFile(adminFile, {
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'admin-files' // Private bucket
  });

  // 4. Download files (public gets direct URL, private gets signed URL)
  const userDownload = await obitox.downloadFile({
    fileUrl: userFileUrl,
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'public-uploads'
  });

  const adminDownload = await obitox.downloadFile({
    fileUrl: adminFileUrl,
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'admin-files'
  });

  console.log('User file (public):', userDownload.downloadUrl);
  console.log('Admin file (private):', adminDownload.downloadUrl);

  // 5. Clean up files
  await obitox.deleteFile({
    fileUrl: userFileUrl,
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'public-uploads'
  });

  await obitox.deleteFile({
    fileUrl: adminFileUrl,
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: 'admin-files'
  });

  console.log('Files cleaned up successfully!');
}
```

## 🔧 Configuration Options

### Upload Options

```typescript
interface UploadOptions {
  filename: string;
  contentType?: string;
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  
  // Provider-specific credentials
  vercelToken?: string;      // For Vercel Blob
  supabaseToken?: string;    // For Supabase Storage
  supabaseUrl?: string;      // For Supabase Storage
  
  // Bucket selection
  bucket?: string;           // Bucket name (for Supabase, AWS, etc.)
  
  // Progress and cancellation
  onProgress?: (progress: number, bytesUploaded: number, totalBytes: number) => void;
  onCancel?: () => void;
}
```

### Download Options

```typescript
interface DownloadFileOptions {
  fileUrl?: string;          // Direct file URL
  filename?: string;         // Or filename + bucket
  provider: 'VERCEL' | 'SUPABASE' | 'AWS' | 'CLOUDINARY';
  bucket?: string;           // Bucket name
  expiresIn?: number;        // For signed URLs (in seconds)
  
  // Provider credentials
  vercelToken?: string;
  supabaseToken?: string;
  supabaseUrl?: string;
}
```

## 🎯 Best Practices

### 1. **Use Environment Variables**

```javascript
const obitox = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  baseUrl: process.env.OBITOX_BASE_URL || 'https://api.obitox.com'
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

### 2. **Handle Errors Gracefully**

```javascript
async function safeUpload(file, bucket) {
  try {
    return await obitox.uploadFile(file, {
      provider: 'SUPABASE',
      supabaseToken: SUPABASE_TOKEN,
      supabaseUrl: SUPABASE_URL,
      bucket: bucket
    });
  } catch (error) {
    console.error('Upload failed:', error.message);
    // Implement retry logic or fallback
    throw error;
  }
}
```

### 3. **Use Progress Tracking for Large Files**

```javascript
const uploadWithProgress = async (file, bucket) => {
  return await obitox.uploadFile(file, {
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: bucket,
    onProgress: (progress) => {
      // Update UI progress bar
      updateProgressBar(progress);
    }
  });
};
```

### 4. **Organize Files by Bucket**

```javascript
// Use different buckets for different purposes
const BUCKETS = {
  USER_UPLOADS: 'public-uploads',    // Public user files
  ADMIN_DOCS: 'admin-files',         // Private admin files
  TEMP_FILES: 'temp-storage',        // Temporary files
  BACKUPS: 'backup-storage'          // Backup files
};

// Upload to appropriate bucket based on file type
const uploadToBucket = async (file, fileType) => {
  let bucket;
  switch (fileType) {
    case 'user-upload':
      bucket = BUCKETS.USER_UPLOADS;
      break;
    case 'admin-doc':
      bucket = BUCKETS.ADMIN_DOCS;
      break;
    default:
      bucket = BUCKETS.TEMP_FILES;
  }
  
  return await obitox.uploadFile(file, {
    provider: 'SUPABASE',
    supabaseToken: SUPABASE_TOKEN,
    supabaseUrl: SUPABASE_URL,
    bucket: bucket
  });
};
```

## 🚀 Getting Started Checklist

- [ ] Get your ObitoX API key
- [ ] Set up your Supabase project (or Vercel Blob)
- [ ] Install the SDK: `npm install @obitox/upload`
- [ ] Initialize ObitoX with your API key
- [ ] Test with a simple upload
- [ ] Implement progress tracking for better UX
- [ ] Add error handling for production
- [ ] Set up bucket organization strategy

## 📞 Support

- **Documentation**: [docs.obitox.com](https://docs.obitox.com)
- **GitHub**: [github.com/obitox/upload-sdk](https://github.com/obitox/upload-sdk)
- **Discord**: [discord.gg/obitox](https://discord.gg/obitox)

---

**Happy coding! 🎉**
