# Batch Presigned URLs Implementation Plan

## Overview
Generate multiple signed URLs in a single API call (1 request = 100 URLs) instead of sequential requests (100 requests = 100 URLs).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BATCH SIGNED URL FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client has 50 files to upload                               │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────┐               │
│  │ POST /api/v1/upload/r2/batch-signed-urls │               │
│  │ Body: {                                  │               │
│  │   files: [                                │               │
│  │     { filename, contentType, fileSize },  │               │
│  │     { filename, contentType, fileSize }, │               │
│  │     ... (50 files)                      │               │
│  │   ]                                     │               │
│  │ }                                       │               │
│  └─────────────────────────────────────────┘               │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────┐               │
│  │ Backend processes in PARALLEL:          │               │
│  │ • Validate all files (parallel)         │               │
│  │ • Generate 50 signed URLs (parallel)     │               │
│  │ • Concurrency limit: 20                 │               │
│  └─────────────────────────────────────────┘               │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────┐               │
│  │ Response: {                             │               │
│  │   signedUrls: [                         │               │
│  │     { url, filename, key, ... },        │               │
│  │     ... (50 URLs)                      │               │
│  │   ],                                    │               │
│  │   summary: { total, success, failed }   │               │
│  │ }                                       │               │
│  └─────────────────────────────────────────┘               │
│         │                                                    │
│         ▼                                                    │
│  Client uploads files in parallel                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Extract Internal Signing Function
**File:** `controllers/providers/r2/r2.helpers.js`
- Create `generateR2SignedUrlInternal(options)` function
- Reusable for both single and batch requests
- Returns `{ uploadUrl, publicUrl, objectKey, expiresIn, ... }`

### Step 2: Create Batch Controller
**File:** `controllers/providers/r2/r2.batch-signed-url.js`
- Process `files` array (max 100)
- Validate batch size
- Parallel processing with concurrency limit
- Handle partial success/failure
- Apply validation to each file
- Return detailed response with errors per file

### Step 3: Add Routes
**File:** `routes/upload.routes.js`
- `POST /api/v1/upload/r2/batch-signed-urls`
- `POST /api/v1/upload/s3/batch-signed-urls`

### Step 4: SDK Integration
**File:** `src/providers/r2/r2.provider.ts`
- Add `batchUpload(files, options)` method
- Support validation presets
- Progress tracking option

**File:** `src/providers/s3/s3.provider.ts`
- Add `batchUpload(files, options)` method
- Same interface as R2

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `controllers/providers/r2/r2.helpers.js` | Modify | Add internal signing function |
| `controllers/providers/r2/r2.batch-signed-url.js` | Create | Batch controller |
| `controllers/providers/s3/s3.batch-signed-url.js` | Create | Batch controller |
| `routes/upload.routes.js` | Modify | Add batch routes |
| `src/types/r2.types.ts` | Modify | Add batch types |
| `src/types/s3.types.ts` | Modify | Add batch types |
| `src/providers/r2/r2.provider.ts` | Modify | Add batchUpload method |
| `src/providers/s3/s3.provider.ts` | Modify | Add batchUpload method |

## API Response Format

### Success Response
```json
{
    "success": true,
    "total": 50,
    "successful": 48,
    "failed": 2,
    "signedUrls": [
        {
            "index": 0,
            "success": true,
            "uploadUrl": "https://...",
            "publicUrl": "https://...",
            "objectKey": "...",
            "expiresIn": 3600,
            "filename": "photo1.jpg"
        }
    ],
    "errors": [
        {
            "index": 5,
            "success": false,
            "filename": "evil.exe",
            "error": "VALIDATION_FAILED",
            "validationErrors": ["Dangerous extension detected"]
        }
    ],
    "performance": {
        "totalTime": "150ms",
        "avgTimePerFile": "3ms"
    }
}
```

### Error Response (batch too large)
```json
{
    "success": false,
    "error": "BATCH_TOO_LARGE",
    "message": "Maximum 100 files per batch",
    "maxFiles": 100,
    "providedFiles": 150
}
```

## Usage Example

```typescript
const client = new ObitoX({ apiKey: '...' });

const files = [file1, file2, file3, ...]; // 50 files

// Get all signed URLs in ONE request
const result = await client.r2.batchUpload(files, {
    r2AccessKey: '...',
    r2SecretKey: '...',
    r2AccountId: '...',
    r2Bucket: 'my-bucket',
    concurrency: 10, // Upload 10 files at a time
    validation: 'images' // Validate all files
});

console.log(`Uploaded: ${result.successful}/${result.total}`);
result.signedUrls.forEach(url => {
    console.log(url.publicUrl);
});
```

## Performance Comparison

| Metric | Sequential | Batch |
|--------|-----------|-------|
| API Calls | 100 | 1 |
| Network Latency | 2-5 seconds | 100-200ms |
| Total Time | 5-10 seconds | 0.5-1 second |
| Speed Improvement | 1x | 10-20x |

## Security Considerations

1. **Rate Limiting**: Batch requests count as 1 request but may generate multiple signed URLs
2. **Validation**: Apply same validation rules to all files in batch
3. **Error Handling**: Partial success is allowed - some files may fail while others succeed
4. **Logging**: Log batch ID and summary for debugging
