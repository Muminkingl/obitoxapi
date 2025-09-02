# ObitoX Upload SDK

Upload files in **3-7 lines of code** with zero bandwidth costs! 🚀

```bash
npm install @obitox/upload
```

## Quick Start

```javascript
import ObitoX from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'ox_your_api_key_here'
});

// Upload a file in 3 lines!
const fileUrl = await obitox.uploadFile(file, {
  vercelToken: 'vercel_blob_rw_your_token_here'
});

console.log('File uploaded:', fileUrl);
```

## Features

- ✅ **3-7 lines of code** - No complex AWS SDK setup
- ✅ **Zero bandwidth costs** - Files never touch your servers
- ✅ **Multiple providers** - Vercel Blob, AWS S3 (coming soon)
- ✅ **TypeScript support** - Full type safety
- ✅ **Usage tracking** - Built-in analytics for billing
- ✅ **Simple pricing** - $4/month for unlimited uploads

## Installation

```bash
npm install @obitox/upload
# or
yarn add @obitox/upload
# or
pnpm add @obitox/upload
```

## Usage

### 1. Initialize

```javascript
import ObitoX from '@obitox/upload';

const obitox = new ObitoX({
  apiKey: 'ox_your_api_key_here',
  baseUrl: 'https://api.obitox.com' // optional, defaults to production
});
```

### 2. Upload Files

#### Simple Upload (3 lines)
```javascript
const fileUrl = await obitox.uploadFile(file, {
  vercelToken: 'vercel_blob_rw_your_token_here'
});
```

#### Manual Upload (7 lines)
```javascript
// Step 1: Get upload URL
const { uploadUrl, fileUrl, headers } = await obitox.upload({
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  vercelToken: 'vercel_blob_rw_your_token_here'
});

// Step 2: Upload file
await fetch(uploadUrl, {
  method: 'PUT',
  headers,
  body: file
});

// Step 3: Track completion
await obitox.track({
  event: 'completed',
  fileUrl,
  filename: 'photo.jpg'
});
```

### 3. Validate API Key

```javascript
const validation = await obitox.validate();
console.log('User plan:', validation.data?.plan);
```

## API Reference

### Constructor

```javascript
new ObitoX(config)
```

**Parameters:**
- `config.apiKey` (string, required) - Your ObitoX API key
- `config.baseUrl` (string, optional) - API base URL (defaults to production)

### Methods

#### `uploadFile(file, options)`

Upload a file with automatic tracking.

**Parameters:**
- `file` (File | Blob) - File to upload
- `options.vercelToken` (string, required) - Your Vercel Blob token

**Returns:** Promise<string> - The uploaded file URL

#### `upload(options)`

Get upload URLs and headers for manual upload.

**Parameters:**
- `options.filename` (string, required) - File name
- `options.contentType` (string, optional) - MIME type
- `options.vercelToken` (string, required) - Your Vercel Blob token

**Returns:** Promise<UploadResponse>

#### `track(options)`

Track upload events for analytics.

**Parameters:**
- `options.event` (string, required) - Event type ('completed', 'failed', etc.)
- `options.fileUrl` (string, required) - File URL
- `options.filename` (string, optional) - File name
- `options.fileSize` (number, optional) - File size in bytes
- `options.provider` (string, optional) - Storage provider

**Returns:** Promise<AnalyticsResponse>

#### `validate()`

Validate your API key and get user information.

**Returns:** Promise<ValidateApiKeyResponse>

## Examples

### React/Next.js File Upload

```javascript
import { useState } from 'react';
import SubDub from '@subdub/upload';

const subdub = new SubDub({
  apiKey: process.env.NEXT_PUBLIC_SUBDUB_API_KEY
});

function FileUpload() {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const fileUrl = await subdub.uploadFile(file, {
        vercelToken: process.env.VERCEL_BLOB_TOKEN
      });
      console.log('Uploaded:', fileUrl);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <input 
      type="file" 
      onChange={(e) => handleUpload(e.target.files[0])}
      disabled={uploading}
    />
  );
}
```

### Node.js Server Upload

```javascript
import SubDub from '@subdub/upload';
import multer from 'multer';

const subdub = new SubDub({
  apiKey: process.env.SUBDUB_API_KEY
});

app.post('/upload', multer().single('file'), async (req, res) => {
  try {
    const fileUrl = await subdub.uploadFile(req.file.buffer, {
      vercelToken: process.env.VERCEL_BLOB_TOKEN
    });
    res.json({ success: true, fileUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Pricing

- **Free**: 100MB uploads per month
- **Pro**: 10GB uploads per month ($4/month)
- **Enterprise**: 100GB uploads per month ($10/month)

## Getting Started

1. **Sign up** at [subdub.com](https://subdub.com)
2. **Get your API key** from the dashboard
3. **Install the SDK**: `npm install @subdub/upload`
4. **Start uploading** in 3 lines of code!

## Support

- 📧 Email: support@subdub.com
- 💬 Discord: [Join our community](https://discord.gg/subdub)
- 📖 Docs: [docs.subdub.com](https://docs.subdub.com)
- 🐛 Issues: [GitHub Issues](https://github.com/subdub/upload/issues)

## License

MIT License - see [LICENSE](LICENSE) for details. 