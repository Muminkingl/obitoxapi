# Uploadcare CDN

> Intelligent CDN with built-in image optimization and virus scanning

## Overview

Uploadcare is a file CDN with smart image optimization and automatic virus scanning. Perfect for applications that need image transformations and security scanning without extra infrastructure.

**Key Features:**
- **Image optimization** - Auto WebP conversion, smart quality, progressive loading
- **Virus scanning** - Auto-scan and delete infected files
- **Public CDN** - Globally distributed content delivery
- **URL transformations** - Resize, crop, format on-the-fly

---

## Getting Started

### Prerequisites

1. **Uploadcare API Keys** - Create from [Uploadcare Dashboard → Settings → API Keys](https://uploadcare.com/dashboard/)
   - Public Key: Safe to expose client-side
   - Secret Key: Keep private (required for virus scan & delete)
   
2. **ObitoX API Credentials**
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
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY
});

console.log('Uploaded:', url);
// Output: https://ucarecdn.com/uuid/photo.jpg
```

### Upload with Auto Image Optimization

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  imageOptimization: {
    auto: true  // WebP + smart quality + progressive!
  }
});

// Automatically optimized for web
```

### Upload with Manual Optimization

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'UPLOADCARE',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY,
  imageOptimization: {
    format: 'webp',
    quality: 'best',
    progressive: true,
    stripMeta: 'sensitive',
    adaptiveQuality: true  // AI-powered quality optimization
  }
});
```

**Image Optimization Options:**

| Option | Values | Description |
|--------|--------|-------------|
| `format` | `auto`, `jpeg`, `png`, `webp`, `preserve` | Image format |
| `quality` | `lightest`, `lighter`, `normal`, `better`, `best` | Quality preset |
| `progressive` | `true`, `false` | Progressive JPEG loading |
| `stripMeta` | `all`, `none`, `sensitive` | Metadata removal |
| `adaptiveQuality` | `true`, `false` | AI-powered quality |

### Upload with Virus Scanning

Automatically scan files for viruses and delete infected ones:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
try {
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
}
```

---

## Delete Files

### Delete Single File

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
await client.deleteFile({
  provider: 'UPLOADCARE',
  fileUrl: 'https://ucarecdn.com/uuid/photo.jpg',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  uploadcareSecretKey: process.env.UPLOADCARE_SECRET_KEY
});
```

---

## Download & CDN URLs

Uploadcare files are **publicly accessible** via CDN by default.

### Get Download URL

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'UPLOADCARE',
  fileUrl: 'https://ucarecdn.com/uuid/photo.jpg',
  uploadcarePublicKey: process.env.UPLOADCARE_PUBLIC_KEY
});

console.log(downloadUrl);
```

---

## URL-Based Transformations

Transform images on-the-fly using URL parameters:

### Resize Image

```
https://ucarecdn.com/uuid/-/resize/800x600/photo.jpg
```

### Convert to WebP

```
https://ucarecdn.com/uuid/-/format/webp/photo.jpg
```

### Crop & Optimize

```
https://ucarecdn.com/uuid/-/crop/300x300/center/-/quality/best/photo.jpg
```

### Multiple Transformations

```
https://ucarecdn.com/uuid/-/resize/1200x/-/format/webp/-/quality/better/-/progressive/yes/photo.jpg
```

**Common Transformations:**
- `-/resize/WIDTHxHEIGHT/` - Resize image
- `-/crop/WIDTHxHEIGHT/center/` - Crop from center
- `-/format/FORMAT/` - Convert format (webp, jpeg, png)
- `-/quality/QUALITY/` - Set quality (lightest to best)
- `-/progressive/yes/` - Progressive JPEG
- `-/blur/STRENGTH/` - Blur image
- `-/sharpen/STRENGTH/` - Sharpen image
- `-/grayscale/` - Convert to grayscale

---

## Virus Scanning Workflow

When `checkVirus: true` is enabled:

1. **Upload** - File uploads to Uploadcare CDN
2. **Scan** - Virus scan is initiated (ClamAV engine)
3. **Poll** - SDK waits for scan completion (max 30s)
4. **Check** - Scan results are verified
5. **Delete** - If infected, file is auto-deleted and error thrown
6. **Return** - If clean, URL is returned

**Note:** Virus scanning requires `uploadcareSecretKey`

---
