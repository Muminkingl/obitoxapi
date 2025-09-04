# 🚀 ObitoX SDK - Complete Developer Usage Guide

## 📋 Overview

The ObitoX SDK provides a unified interface for file uploads, downloads, and management across multiple cloud storage providers. It uses a "man in the middle" architecture where **developers provide their own storage provider credentials**, and ObitoX generates signed URLs for direct client-to-storage operations, ensuring **zero bandwidth cost** on your servers.

## 🎯 Supported Providers

- ✅ **Vercel Blob** - Fast, global file storage
- ✅ **Supabase Storage** - PostgreSQL-backed object storage with RLS
- 🔄 **AWS S3** - Coming soon
- 🔄 **Cloudinary** - Coming soon

## 🏗️ Architecture

```
Developer App → ObitoX API → Storage Provider
     ↓              ↓              ↓
  Your Files → Signed URLs → Direct Upload
```

**Key Benefits:**
- 🚀 **Zero bandwidth cost** - Files never touch your servers
- 🔒 **Secure** - Uses signed URLs for direct uploads
- 📊 **Analytics** - Built-in tracking and metrics
- 🎛️ **Unified API** - Same interface for all providers

## 📦 Installation

```bash
npm install @obitox/upload
```

## 🔑 Setup

### 1. Get Your ObitoX API Key

Sign up at [ObitoX Dashboard](https://dashboard.obitox.com) to get your API key.

### 2. Get Your Storage Provider Credentials

#### For Vercel Blob:
```bash
# Get your Vercel Blob token from Vercel Dashboard
# Or use: vercel env pull
```

#### For Supabase Storage:
```bash
# Get from your Supabase project settings
# 1. Project URL: https://your-project.supabase.co
# 2. Service Role Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Initialize the SDK

```javascript
import ObitoX from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'ox_your_api_key_here',
  baseUrl: 'https://api.obitox.com' // or your custom endpoint
});
```

## 🚀 Usage Examples

### 📤 Upload Files

#### Vercel Blob Upload

```javascript
import ObitoX from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'ox_your_api_key_here'
});

// Upload with progress tracking
const file = document.getElementById('fileInput').files[0];

const fileUrl = await obitox.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here',
  onProgress: (progress, bytesUploaded, totalBytes) => {
    console.log(`Upload progress: ${progress.toFixed(1)}%`);
    console.log(`Uploaded: ${(bytesUploaded / 1024 / 1024).toFixed(2)}MB / ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
  }
});

console.log('File uploaded:', fileUrl);
```

#### Supabase Storage Upload

```javascript
// Upload to specific bucket
const fileUrl = await obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // Your service role key
  supabaseUrl: 'https://your-project.supabase.co', // Your project URL
  bucket: 'public-files', // Optional: specify bucket (defaults to 'test')
  onProgress: (progress) => {
    console.log(`Upload progress: ${progress.toFixed(1)}%`);
  }
});

console.log('File uploaded to Supabase:', fileUrl);
```

### 📥 Download Files

#### Vercel Blob Download

```javascript
// Download from Vercel Blob
const downloadResult = await obitox.downloadFile({
  fileUrl: 'https://blob.vercel-storage.com/your-file.jpg',
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here'
});

console.log('Download URL:', downloadResult.downloadUrl);
```

#### Supabase Storage Download

```javascript
// Download from public bucket (direct URL)
const downloadResult = await obitox.downloadFile({
  fileUrl: 'https://your-project.supabase.co/storage/v1/object/public/bucket/file.jpg',
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  supabaseUrl: 'https://your-project.supabase.co',
  bucket: 'public-files'
});

console.log('Download URL:', downloadResult.downloadUrl);

// Download from private bucket (signed URL)
const privateDownloadResult = await obitox.downloadFile({
  filename: 'private-document.pdf',
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  supabaseUrl: 'https://your-project.supabase.co',
  bucket: 'private-files',
  expiresIn: 3600 // 1 hour
});

console.log('Private download URL:', privateDownloadResult.downloadUrl);
console.log('Expires at:', privateDownloadResult.expiresAt);
```

### 🗑️ Delete Files

#### Vercel Blob Delete

```javascript
const deleted = await obitox.deleteFile({
  fileUrl: 'https://blob.vercel-storage.com/your-file.jpg',
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here'
});

console.log('File deleted:', deleted);
```

#### Supabase Storage Delete

```javascript
const deleted = await obitox.deleteFile({
  fileUrl: 'https://your-project.supabase.co/storage/v1/object/public/bucket/file.jpg',
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  supabaseUrl: 'https://your-project.supabase.co',
  bucket: 'public-files'
});

console.log('File deleted:', deleted);
```

### 🪣 Supabase Bucket Management

#### List Available Buckets

```javascript
const buckets = await obitox.listBuckets({
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  supabaseUrl: 'https://your-project.supabase.co'
});

console.log('Available buckets:');
buckets.forEach(bucket => {
  console.log(`- ${bucket.name} (${bucket.public ? 'Public' : 'Private'}) - ${bucket.fileCount} files`);
});
```

#### Upload to Different Buckets

```javascript
// Upload to public bucket
const publicFileUrl = await obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  supabaseUrl: 'https://your-project.supabase.co',
  bucket: 'public-images'
});

// Upload to private bucket
const privateFileUrl = await obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  supabaseUrl: 'https://your-project.supabase.co',
  bucket: 'private-documents'
});
```

### ⏹️ Cancel Uploads

```javascript
// Cancel an ongoing upload
const cancelled = await obitox.cancelUpload({
  uploadId: 'upload-123',
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here'
});

console.log('Upload cancelled:', cancelled);
```

### 📊 Analytics & Health Checks

```javascript
// Check provider health
const isHealthy = await obitox.checkHealth('vercel');
console.log('Vercel health:', isHealthy);

// Get usage statistics
const stats = await obitox.getStats();
console.log('Usage stats:', stats);
```

## 🔧 Advanced Features

### Progress Tracking with UI

```javascript
const file = document.getElementById('fileInput').files[0];

// Create progress bar
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const fileUrl = await obitox.uploadFile(file, {
  provider: 'VERCEL',
  vercelToken: 'vercel_blob_rw_your_token_here',
  onProgress: (progress, bytesUploaded, totalBytes) => {
    // Update progress bar
    progressBar.style.width = `${progress}%`;
    
    // Update text
    const uploadedMB = (bytesUploaded / 1024 / 1024).toFixed(2);
    const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
    progressText.textContent = `${progress.toFixed(1)}% (${uploadedMB}MB / ${totalMB}MB)`;
  }
});
```

### Error Handling

```javascript
try {
  const fileUrl = await obitox.uploadFile(file, {
    provider: 'VERCEL',
    vercelToken: 'vercel_blob_rw_your_token_here'
  });
  
  console.log('Upload successful:', fileUrl);
} catch (error) {
  if (error.message.includes('VERCEL_SIZE_LIMIT_EXCEEDED')) {
    console.error('File too large for Vercel (max 4.5MB)');
  } else if (error.message.includes('INVALID_TOKEN')) {
    console.error('Invalid Vercel token');
  } else {
    console.error('Upload failed:', error.message);
  }
}
```

### File Validation

```javascript
// The SDK automatically validates:
// - File size limits (Vercel: 4.5MB, Supabase: 50MB)
// - File type restrictions
// - Security checks (no executable files)
// - Filename sanitization
```

## 📋 Provider-Specific Features

### Vercel Blob
- ✅ **Size Limit**: 4.5MB per request
- ✅ **Global CDN**: Fast worldwide access
- ✅ **Automatic optimization**: Image resizing, format conversion
- ✅ **Direct uploads**: Signed URLs for zero bandwidth cost

### Supabase Storage
- ✅ **Bucket support**: Organize files by bucket
- ✅ **Public/Private**: Control access with RLS
- ✅ **Signed URLs**: Secure private file access
- ✅ **PostgreSQL integration**: File metadata in database
- ✅ **Size Limit**: 50MB per file

## 🔒 Security Best Practices

### 1. Token Management
```javascript
// ✅ Good: Store tokens in environment variables
const obitox = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY
});

const fileUrl = await obitox.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: process.env.SUPABASE_URL
});

// ❌ Bad: Hardcode tokens in client-side code
```

### 2. File Validation
```javascript
// The SDK automatically handles:
// - File type validation
// - Size limit enforcement
// - Security scanning
// - Filename sanitization
```

### 3. Access Control
```javascript
// For private files, use signed URLs with expiration
const downloadResult = await obitox.downloadFile({
  filename: 'sensitive-document.pdf',
  provider: 'SUPABASE',
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  bucket: 'private-documents',
  expiresIn: 3600 // 1 hour expiration
});
```

## 🚨 Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| `INVALID_API_KEY` | API key is missing or invalid | Check your API key |
| `INVALID_TOKEN` | Provider token is invalid | Verify your provider credentials |
| `FILE_TOO_LARGE` | File exceeds size limit | Reduce file size or use chunked upload |
| `INVALID_FILE_TYPE` | File type not allowed | Check allowed file types |
| `BUCKET_ACCESS_DENIED` | No access to specified bucket | Check bucket permissions |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement retry logic |

## 📊 Analytics & Monitoring

The SDK automatically tracks:
- Upload/download success rates
- File sizes and types
- Provider usage
- Error rates
- Performance metrics

Access your analytics at [ObitoX Dashboard](https://dashboard.obitox.com).

## 🆘 Support

- 📚 **Documentation**: [docs.obitox.com](https://docs.obitox.com)
- 💬 **Discord**: [discord.gg/obitox](https://discord.gg/obitox)
- 📧 **Email**: support@obitox.com
- 🐛 **Issues**: [GitHub Issues](https://github.com/obitox/upload/issues)

## 🎯 Quick Start Checklist

- [ ] Get ObitoX API key
- [ ] Get storage provider credentials (Vercel/Supabase)
- [ ] Install SDK: `npm install @obitox/upload`
- [ ] Initialize: `new ObitoX({ apiKey: 'your-key' })`
- [ ] Upload: `obitox.uploadFile(file, { provider: 'VERCEL', vercelToken: 'your-token' })`
- [ ] Handle progress: `onProgress: (progress) => console.log(progress)`
- [ ] Handle errors: `try/catch` around upload calls
- [ ] Test with different file sizes and types

---

**Ready to start?** Check out our [live examples](https://examples.obitox.com) or run the test file to see everything in action! 🚀
