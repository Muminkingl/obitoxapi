# 🔥 FEATURE #3: RESUMABLE MULTIPART UPLOADS

**The Ultimate Upload Feature** - This is what separates amateur SDKs from professional ones!

---

# 🎯 Implementation Plan - TIER 2 FINAL FEATURE

## 📋 What This Feature Does

### The Problem:
```javascript
// ❌ CURRENT: Large file upload fails if connection drops

const file = new File([...], 'movie.mp4'); // 2GB file

// User starts upload...
await client.upload(file); // Uploading... 50%... 75%...

// WiFi disconnects! 😱
// Error: Network request failed

// User has to start over from 0%! 😡
// They wasted 10 minutes uploading 1.5GB!
```

### The Solution:
```javascript
// ✅ NEW: Resumable upload saves progress, resumes where it left off

const upload = await client.resumableUpload(file, {
  onProgress: (progress) => {
    console.log(`${progress.percentage}% uploaded`);
    // Save resume token
    localStorage.setItem('resumeToken', progress.resumeToken);
  }
});

// Upload paused at 75%...
// WiFi disconnects... 😱
// WiFi reconnects... ✅

// Resume upload from 75%!
const resumeToken = localStorage.getItem('resumeToken');
await client.resumeUpload(resumeToken);
// Continues from 75%! Only uploads remaining 25%! 🎉
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                 RESUMABLE MULTIPART UPLOAD FLOW                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CLIENT: Split file into parts (5MB each)                    │
│     ┌──────────────────────────────────────┐                   │
│     │ File: movie.mp4 (500MB)              │                   │
│     │ ├─ Part 1: 5MB                       │                   │
│     │ ├─ Part 2: 5MB                       │                   │
│     │ ├─ Part 3: 5MB                       │                   │
│     │ └─ ... (100 parts total)             │                   │
│     └──────────────────────────────────────┘                   │
│                                                                 │
│  2. API: Initialize multipart upload                            │
│     POST /api/v1/upload/multipart/init                          │
│     → Returns: uploadId, partUrls[], resumeToken               │
│                                                                 │
│  3. CLIENT: Upload parts in parallel (5 at a time)              │
│     ┌──────────────────────────────────────┐                   │
│     │ Part 1 → S3 → ✅ ETag: "abc123"      │                   │
│     │ Part 2 → S3 → ✅ ETag: "def456"      │                   │
│     │ Part 3 → S3 → ✅ ETag: "ghi789"      │                   │
│     │ ... (parallel upload)                 │                   │
│     └──────────────────────────────────────┘                   │
│                                                                 │
│  4. CLIENT: Track progress in DB/localStorage                   │
│     {                                                           │
│       uploadId: "mpu_abc123",                                   │
│       completedParts: [                                         │
│         { partNumber: 1, etag: "abc123" },                     │
│         { partNumber: 2, etag: "def456" }                      │
│       ]                                                         │
│     }                                                           │
│                                                                 │
│  5. CONNECTION DROPS! 😱                                        │
│     - Save resumeToken to localStorage                          │
│     - Stop upload                                               │
│                                                                 │
│  6. CONNECTION RESTORED! ✅                                     │
│     - Get resumeToken from localStorage                         │
│     - POST /api/v1/upload/multipart/resume                      │
│     - Get list of uploaded parts                                │
│     - Continue uploading remaining parts                        │
│                                                                 │
│  7. ALL PARTS UPLOADED! 🎉                                      │
│     - POST /api/v1/upload/multipart/complete                    │
│     - S3 combines all parts into final file                     │
│     - Returns final URL                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Files to Create/Modify

### New Files (Backend):
```bash
controllers/multipart/init.controller.js       # Initialize multipart upload
controllers/multipart/resume.controller.js     # Resume upload (get progress)
controllers/multipart/complete.controller.js   # Complete upload (combine parts)
controllers/multipart/abort.controller.js      # Abort upload (cleanup)
routes/multipart.routes.js                     # Multipart routes
utils/multipart-helpers.js                     # Part size calculation
```

### New Files (SDK):
```bash
sdk/multipart/resumable-upload.js              # Client-side resumable upload
sdk/multipart/resume-manager.js                # Resume token management
sdk/multipart/part-uploader.js                 # Parallel part upload
```

### Database Schema:
```sql
-- Table to track multipart uploads
CREATE TABLE multipart_uploads (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    upload_id VARCHAR(255) NOT NULL,    -- S3 multipart upload ID
    provider VARCHAR(20) NOT NULL,       -- 'S3', 'R2'
    bucket VARCHAR(255) NOT NULL,
    file_key VARCHAR(500) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    part_size INT NOT NULL,              -- 5MB, 10MB, etc.
    total_parts INT NOT NULL,
    completed_parts JSONB DEFAULT '[]', -- [{ partNumber, etag }]
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'aborted'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);
```

---

## 🚀 Step-by-Step Implementation

### Step 1: Initialize Multipart Upload API

```javascript
// controllers/multipart/init.controller.js

export async function initMultipartUpload(req, res) {
    try {
        const {
            filename,
            fileSize,
            contentType,
            provider,
            r2AccessKey,
            r2SecretKey,
            r2AccountId,
            r2Bucket,
            partSize = 5 * 1024 * 1024 // Default: 5MB
        } = req.body;

        // Calculate total parts
        const totalParts = Math.ceil(fileSize / partSize);

        // Initialize S3/R2 multipart upload
        const r2 = getR2Client(r2AccessKey, r2SecretKey, r2AccountId);
        
        const multipartUpload = await r2.send(new CreateMultipartUploadCommand({
            Bucket: r2Bucket,
            Key: `multipart/${Date.now()}_${filename}`,
            ContentType: contentType
        }));

        const uploadId = multipartUpload.UploadId;

        // Generate presigned URLs for each part
        const partUrls = [];
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
            const url = await r2.getSignedUrl(new UploadPartCommand({
                Bucket: r2Bucket,
                Key: multipartUpload.Key,
                PartNumber: partNumber,
                UploadId: uploadId
            }), { expiresIn: 3600 });
            
            partUrls.push({
                partNumber,
                url,
                size: partNumber === totalParts 
                    ? fileSize % partSize || partSize 
                    : partSize
            });
        }

        // Save to database
        const resumeToken = crypto.randomUUID();
        
        await supabaseAdmin.from('multipart_uploads').insert({
            id: resumeToken,
            user_id: req.userId,
            upload_id: uploadId,
            provider: 'R2',
            bucket: r2Bucket,
            file_key: multipartUpload.Key,
            filename,
            file_size: fileSize,
            part_size: partSize,
            total_parts: totalParts,
            status: 'active'
        });

        res.json({
            success: true,
            resumeToken,
            uploadId,
            fileKey: multipartUpload.Key,
            partUrls,
            totalParts,
            partSize
        });

    } catch (error) {
        console.error('[Multipart Init] Error:', error);
        res.status(500).json({
            success: false,
            error: 'MULTIPART_INIT_FAILED',
            message: error.message
        });
    }
}
```

---

### Step 2: Resume Multipart Upload API

```javascript
// controllers/multipart/resume.controller.js

export async function resumeMultipartUpload(req, res) {
    try {
        const { resumeToken } = req.body;

        // Get upload from database
        const { data: upload, error } = await supabaseAdmin
            .from('multipart_uploads')
            .select('*')
            .eq('id', resumeToken)
            .eq('user_id', req.userId)
            .single();

        if (error || !upload) {
            return res.status(404).json({
                success: false,
                error: 'UPLOAD_NOT_FOUND'
            });
        }

        // Check expiration
        if (new Date(upload.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                error: 'UPLOAD_EXPIRED'
            });
        }

        // Get list of uploaded parts from S3/R2
        const r2 = getR2Client(...);
        
        const parts = await r2.send(new ListPartsCommand({
            Bucket: upload.bucket,
            Key: upload.file_key,
            UploadId: upload.upload_id
        }));

        const uploadedParts = parts.Parts?.map(p => ({
            partNumber: p.PartNumber,
            etag: p.ETag,
            size: p.Size
        })) || [];

        // Calculate remaining parts
        const uploadedPartNumbers = new Set(uploadedParts.map(p => p.partNumber));
        const remainingParts = [];
        
        for (let i = 1; i <= upload.total_parts; i++) {
            if (!uploadedPartNumbers.has(i)) {
                remainingParts.push(i);
            }
        }

        // Generate presigned URLs for remaining parts
        const partUrls = [];
        for (const partNumber of remainingParts) {
            const url = await r2.getSignedUrl(new UploadPartCommand({
                Bucket: upload.bucket,
                Key: upload.file_key,
                PartNumber: partNumber,
                UploadId: upload.upload_id
            }), { expiresIn: 3600 });
            
            partUrls.push({
                partNumber,
                url,
                size: partNumber === upload.total_parts
                    ? upload.file_size % upload.part_size || upload.part_size
                    : upload.part_size
            });
        }

        res.json({
            success: true,
            uploadId: upload.upload_id,
            fileKey: upload.file_key,
            totalParts: upload.total_parts,
            uploadedParts,
            remainingParts: partUrls,
            progress: {
                uploaded: uploadedParts.length,
                total: upload.total_parts,
                percentage: (uploadedParts.length / upload.total_parts * 100).toFixed(1)
            }
        });

    } catch (error) {
        console.error('[Multipart Resume] Error:', error);
        res.status(500).json({
            success: false,
            error: 'MULTIPART_RESUME_FAILED',
            message: error.message
        });
    }
}
```

---

### Step 3: Complete Multipart Upload API

```javascript
// controllers/multipart/complete.controller.js

export async function completeMultipartUpload(req, res) {
    try {
        const { resumeToken, parts } = req.body;
        // parts = [{ partNumber: 1, etag: "abc123" }, ...]

        // Get upload from database
        const { data: upload } = await supabaseAdmin
            .from('multipart_uploads')
            .select('*')
            .eq('id', resumeToken)
            .single();

        // Complete multipart upload on S3/R2
        const r2 = getR2Client(...);
        
        const result = await r2.send(new CompleteMultipartUploadCommand({
            Bucket: upload.bucket,
            Key: upload.file_key,
            UploadId: upload.upload_id,
            MultipartUpload: {
                Parts: parts.map(p => ({
                    PartNumber: p.partNumber,
                    ETag: p.etag
                }))
            }
        }));

        // Update database
        await supabaseAdmin
            .from('multipart_uploads')
            .update({
                status: 'completed',
                completed_parts: parts
            })
            .eq('id', resumeToken);

        // Get final URL
        const finalUrl = `https://pub-${upload.bucket}.r2.dev/${upload.file_key}`;

        res.json({
            success: true,
            url: finalUrl,
            etag: result.ETag,
            location: result.Location
        });

    } catch (error) {
        console.error('[Multipart Complete] Error:', error);
        res.status(500).json({
            success: false,
            error: 'MULTIPART_COMPLETE_FAILED',
            message: error.message
        });
    }
}
```

---

### Step 4: SDK Implementation

```javascript
// sdk/multipart/resumable-upload.js

export class ResumableUpload {
    constructor(client, file, options = {}) {
        this.client = client;
        this.file = file;
        this.options = options;
        this.partSize = options.partSize || 5 * 1024 * 1024; // 5MB
        this.concurrency = options.concurrency || 5;
        this.resumeToken = options.resumeToken || null;
        this.uploadedParts = [];
    }

    async start() {
        // Initialize or resume
        if (this.resumeToken) {
            return await this.resume();
        } else {
            return await this.init();
        }
    }

    async init() {
        // Initialize multipart upload
        const response = await this.client.makeRequest('/upload/multipart/init', {
            method: 'POST',
            body: {
                filename: this.file.name,
                fileSize: this.file.size,
                contentType: this.file.type,
                partSize: this.partSize,
                ...this.options
            }
        });

        this.resumeToken = response.resumeToken;
        this.uploadId = response.uploadId;
        this.partUrls = response.partUrls;
        this.totalParts = response.totalParts;

        // Start uploading parts
        return await this.uploadParts(this.partUrls);
    }

    async resume() {
        // Resume multipart upload
        const response = await this.client.makeRequest('/upload/multipart/resume', {
            method: 'POST',
            body: { resumeToken: this.resumeToken }
        });

        this.uploadId = response.uploadId;
        this.uploadedParts = response.uploadedParts;
        this.partUrls = response.remainingParts;
        this.totalParts = response.totalParts;

        // Report progress
        if (this.options.onProgress) {
            this.options.onProgress({
                uploaded: this.uploadedParts.length,
                total: this.totalParts,
                percentage: (this.uploadedParts.length / this.totalParts * 100)
            });
        }

        // Upload remaining parts
        return await this.uploadParts(this.partUrls);
    }

    async uploadParts(partUrls) {
        const results = [];

        // Upload parts with concurrency limit
        for (let i = 0; i < partUrls.length; i += this.concurrency) {
            const batch = partUrls.slice(i, i + this.concurrency);
            
            const batchResults = await Promise.all(
                batch.map(part => this.uploadPart(part))
            );
            
            results.push(...batchResults);
        }

        // Complete upload
        const allParts = [...this.uploadedParts, ...results];
        
        return await this.complete(allParts);
    }

    async uploadPart(part) {
        const start = (part.partNumber - 1) * this.partSize;
        const end = Math.min(start + part.size, this.file.size);
        const blob = this.file.slice(start, end);

        const response = await fetch(part.url, {
            method: 'PUT',
            body: blob,
            headers: {
                'Content-Type': this.file.type
            }
        });

        const etag = response.headers.get('ETag');

        // Track progress
        if (this.options.onPartComplete) {
            this.options.onPartComplete({
                partNumber: part.partNumber,
                etag,
                resumeToken: this.resumeToken
            });
        }

        if (this.options.onProgress) {
            const uploaded = this.uploadedParts.length + 1;
            this.options.onProgress({
                uploaded,
                total: this.totalParts,
                percentage: (uploaded / this.totalParts * 100),
                resumeToken: this.resumeToken
            });
        }

        return {
            partNumber: part.partNumber,
            etag: etag.replace(/"/g, '')
        };
    }

    async complete(parts) {
        const response = await this.client.makeRequest('/upload/multipart/complete', {
            method: 'POST',
            body: {
                resumeToken: this.resumeToken,
                parts: parts.sort((a, b) => a.partNumber - b.partNumber)
            }
        });

        return response.url;
    }
}
```

---

## 📊 Usage Examples

### Example 1: Basic Resumable Upload

```javascript
const r2 = client.r2({ accessKey: '...', bucket: '...' });

const upload = await r2.resumableUpload(largeFile, {
    onProgress: (progress) => {
        console.log(`${progress.percentage}% uploaded`);
        // Save resume token
        localStorage.setItem('resumeToken', progress.resumeToken);
    },
    onPartComplete: (part) => {
        console.log(`Part ${part.partNumber} uploaded!`);
    }
});

console.log('Upload complete:', upload.url);
```

### Example 2: Resume After Disconnect

```javascript
// Get saved resume token
const resumeToken = localStorage.getItem('resumeToken');

if (resumeToken) {
    // Resume upload
    const upload = await r2.resumeUpload(resumeToken, {
        onProgress: (progress) => {
            console.log(`Resuming... ${progress.percentage}%`);
        }
    });
    
    console.log('Upload completed:', upload.url);
}
```

---
