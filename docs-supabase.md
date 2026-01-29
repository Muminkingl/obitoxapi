# Supabase Storage

> PostgreSQL-integrated object storage with Row Level Security (RLS)

## Overview

Supabase Storage provides S3-compatible object storage tightly integrated with your PostgreSQL database. Perfect for applications already using Supabase for their backend.

**Key Features:**
- **PostgreSQL integration** - Direct database integration
- **Row Level Security (RLS)** - Fine-grained access control
- **Public & private buckets** - Flexible privacy options
- **Signed URLs** - Time-limited secure access
- **Zero bandwidth cost** - Direct uploads to Supabase

---

## Getting Started

### Prerequisites

1. **Supabase Project** - Create from [Supabase Dashboard](https://supabase.com/dashboard)
   - Project URL: `https://xxxxx.supabase.co`
   - Service Role Key: From Project Settings → API
   
2. **Create Storage Bucket** - From Storage → Create bucket
   - Public or private bucket
   - Configure RLS policies
   
3. **ObitoX API Credentials**
   ```bash
   OBITOX_API_KEY=ox_xxxxxxxxxxxxxxxxxxxx
   OBITOX_API_SECRET=sk_xxxxxxxxxxxxxxxxxxxx
   ```

---

## Upload Features

### Upload to Public Bucket

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
import ObitoX from 'obitox';

const client = new ObitoX({
  apiKey: process.env.OBITOX_API_KEY,
  apiSecret: process.env.OBITOX_API_SECRET
});

// Upload to public bucket
const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'avatars'  // Public bucket
});

console.log('Public URL:', url);
// Output: https://xxx.supabase.co/storage/v1/object/public/avatars/photo.jpg
```

### Upload to Private Bucket with Signed URL

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'admin',  // Private bucket
  expiresIn: 3600   // Signed URL valid for 1 hour
});

console.log('Signed URL:', url);
// Output: https://xxx.supabase.co/storage/v1/object/sign/admin/document.pdf?token=...
```

---

## Delete Files

### Delete Single File

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
await client.deleteFile({
  provider: 'SUPABASE',
  fileUrl: 'https://xxx.supabase.co/storage/v1/object/public/avatars/photo.jpg',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'avatars'
});
```

---

## Download & Signed URLs

### Public Bucket (Direct Access)

Public bucket files are accessible without authentication:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'SUPABASE',
  filename: 'photo.jpg',
  bucket: 'avatars'
});

console.log(downloadUrl);
// Output: https://xxx.supabase.co/storage/v1/object/public/avatars/photo.jpg
```

### Private Bucket (Signed URL)

Private bucket files require signed URLs:

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const downloadUrl = await client.downloadFile({
  provider: 'SUPABASE',
  filename: 'invoice.pdf',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'admin',
  expiresIn: 300  // 5 minutes
});

console.log(downloadUrl);
// Output: https://xxx.supabase.co/storage/v1/object/sign/admin/invoice.pdf?token=...
```

---

## Bucket Management

### List All Buckets

```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const supabaseProvider = client.providers.get('SUPABASE');

const buckets = await supabaseProvider.listBuckets({
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY
});

buckets.forEach(bucket => {
  console.log(`${bucket.name} - Public: ${bucket.public}`);
});
```

---

## Row Level Security (RLS)

Supabase Storage integrates with PostgreSQL RLS for fine-grained access control.

### Example RLS Policies

**Allow public read access:**
```sql
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

**Allow authenticated users to upload:**
```sql
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-uploads' 
  AND auth.role() = 'authenticated'
);
```

**Allow users to access only their files:**
```sql
CREATE POLICY "User Access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'private' 
  AND auth.uid() = owner
);
```

---

## Public vs Private Buckets

| Feature | Public Bucket | Private Bucket |
|---------|---------------|----------------|
| **Access** | Anyone with URL | Requires authentication |
| **URL format** | `/public/bucket/file` | `/sign/bucket/file?token=...` |
| **Signed URLs** | Not needed | Required |
| **RLS policies** | Optional | Recommended |
| **Use cases** | Avatars, logos, public images | Documents, private files, user data |

---

## Best Practices

### 1. **Use Service Role Key Securely**
```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
// ✅ Server-side only (Next.js API route, Node.js, etc.)
const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,  // Keep secret!
  bucket: 'uploads'
});

// ❌ Never expose service role key in client-side code
```

### 2. **Enable RLS for Private Buckets**
Always configure RLS policies for private buckets to prevent unauthorized access.

### 3. **Use Short Expiration for Sensitive Files**
```ts theme={"theme":{"light":"github-light","dark":"vesper"}}
const url = await client.uploadFile(file, {
  provider: 'SUPABASE',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseToken: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: 'confidential',
  expiresIn: 300  // 5 minutes for sensitive files
});
```

---

## Next Steps

- [Cloudflare R2](/docs/providers/r2) - Zero egress fees
- [Amazon S3](/docs/providers/s3) - Enterprise features
- [Uploadcare](/docs/providers/uploadcare) - Image optimization
