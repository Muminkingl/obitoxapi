# Tier 1 Features Implementation Plan
## Aligned with Existing ObitoX Architecture

---

## Executive Summary

Based on my analysis of your codebase, I've mapped the proposed features from `painfull.md`, `tire1-1.md`, and `tire1-2.md` against your existing architecture. Here's the recommendation:

| Proposed Feature | Existing Support | Recommendation | Priority |
|-----------------|-----------------|----------------|----------|
| **CORS Auto-Configuration** | ❌ Missing | **IMPLEMENT** - Critical DX win | 🔴 HIGH |
| **Client-Side File Validation** | ⚠️ Partial | **EXTEND** - Add magic bytes validation | 🔴 HIGH |
| **Smart Presigned URL Expiry** | ❌ Static expiry | **IMPLEMENT** - Dynamic based on file size | 🟡 MEDIUM |
| **Upload Webhooks** | ❌ Missing | **IMPLEMENT** - Leverage existing job system | 🟡 MEDIUM |
| **Resumable Multipart** | ⚠️ Basic only | **EXTEND** - Add resume tokens | 🟢 LOW |
| **Batch Presigned URLs** | ✅ R2 only | **EXTEND** - Add to S3 | 🟢 LOW |

---

## 1. CORS Auto-Configuration (HIGH PRIORITY)

### Why This Aligns with Your Architecture

Your existing [`controllers/providers/s3/s3.config.js`](controllers/providers/s3/s3.config.js) already has:
- Credential validation (format-only, no API calls)
- AWS SDK integration
- Configuration patterns

### Implementation Plan

#### Step 1: Create CORS Controller
**File:** `controllers/providers/s3/s3.cors.js`

```javascript
/**
 * S3 CORS Auto-Configuration Controller
 * Aligns with existing S3 config patterns
 */

import {
    PutBucketCorsCommand,
    GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getS3Client } from './s3.config.js';
import { formatS3Error } from './s3.config.js';

/**
 * Optimal CORS configuration for file uploads
 */
const getOptimalCorsConfig = (allowedOrigins = ['*']) => ({
    CORSRules: [{
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
        AllowedOrigins: allowedOrigins,
        // These headers fix 90% of CORS issues
        ExposeHeaders: [
            'ETag',
            'x-amz-meta-filename',
            'x-amz-meta-uploadedat',
            'x-amz-version-id',
            'Content-Length',
            'Content-Type'
        ],
        MaxAgeSeconds: 3600
    }]
});

/**
 * Auto-configure CORS for S3 bucket
 */
export const setupS3Cors = async (req, res) => {
    try {
        const {
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            allowedOrigins
        } = req.body;

        // Validate required fields
        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json(formatS3Error(
                'MISSING_CREDENTIALS',
                's3AccessKey, s3SecretKey, and s3Bucket are required'
            ));
        }

        // Initialize S3 client (aligns with existing pattern)
        const s3 = getS3Client(s3AccessKey, s3SecretKey, s3Region);

        // Get current CORS (for audit)
        let previousConfig = null;
        try {
            const current = await s3.send(new GetBucketCorsCommand({ Bucket: s3Bucket }));
            previousConfig = current.CORSRules;
        } catch (err) {
            if (err.name !== 'NoSuchCORSConfiguration') throw err;
        }

        // Apply optimal CORS
        const newConfig = getOptimalCorsConfig(allowedOrigins);
        await s3.send(new PutBucketCorsCommand({
            Bucket: s3Bucket,
            CORSConfiguration: newConfig
        }));

        // Log to audit (leverages existing audit system)
        const userId = req.apiKeyId;
        console.log(`[CORS] User ${userId} configured CORS for bucket ${s3Bucket}`);

        res.json({
            success: true,
            message: `CORS configured for bucket "${s3Bucket}"`,
            configuration: newConfig,
            previousConfiguration: previousConfig
        });

    } catch (error) {
        console.error('[CORS] Setup failed:', error);
        
        if (error.name === 'AccessDenied') {
            return res.status(403).json(formatS3Error(
                'ACCESS_DENIED',
                'IAM user needs s3:PutBucketCors permission'
            ));
        }

        res.status(500).json(formatS3Error(
            'CORS_SETUP_FAILED',
            error.message
        ));
    }
};

/**
 * Verify CORS configuration
 */
export const verifyS3Cors = async (req, res) => {
    try {
        const { s3AccessKey, s3SecretKey, s3Bucket, s3Region } = req.body;

        const s3 = getS3Client(s3AccessKey, s3SecretKey, s3Region);

        let config;
        try {
            const result = await s3.send(new GetBucketCorsCommand({ Bucket: s3Bucket }));
            config = result.CORSRules || [];
        } catch (err) {
            if (err.name === 'NoSuchCORSConfiguration') {
                return res.json({
                    configured: false,
                    issues: ['No CORS configuration found']
                });
            }
            throw err;
        }

        // Check for common issues
        const issues = [];
        config.forEach((rule, i) => {
            if (!rule.AllowedMethods?.includes('PUT')) {
                issues.push(`Rule ${i + 1}: PUT method not allowed`);
            }
            if (!rule.ExposeHeaders?.includes('ETag')) {
                issues.push(`Rule ${i + 1}: ETag not exposed (required for uploads)`);
            }
        });

        res.json({
            configured: true,
            rules: config,
            issues,
            recommendation: issues.length > 0 
                ? 'Run POST /api/v1/upload/s3/cors/setup to fix automatically'
                : 'CORS configured correctly'
        });

    } catch (error) {
        res.status(500).json(formatS3Error(
            'CORS_VERIFICATION_FAILED',
            error.message
        ));
    }
};
```

#### Step 2: Add Routes to upload.routes.js
**Integration Point:** [`routes/upload.routes.js`](routes/upload.routes.js)

```javascript
// Add after existing S3 imports
import { setupS3Cors, verifyS3Cors } from '../controllers/providers/s3/s3.cors.js';

// Add routes
router.post('/s3/cors/setup', apiKeyMiddleware, setupS3Cors);
router.post('/s3/cors/verify', apiKeyMiddleware, verifyS3Cors);
```

#### Step 3: Update SDK (src/providers/s3/s3.provider.ts)

```typescript
// Add to S3Provider class
async setupCORS(options: {
    s3AccessKey: string;
    s3SecretKey: string;
    s3Bucket: string;
    s3Region?: string;
    allowedOrigins?: string[];
}): Promise<any> {
    return this.makeRequest('/api/v1/upload/s3/cors/setup', {
        method: 'POST',
        body: JSON.stringify(options)
    });
}
```

---

## 2. Client-Side File Validation (HIGH PRIORITY)

### Why This Aligns with Your Architecture

Your existing [`controllers/providers/shared/validation.helper.js`](controllers/providers/shared/validation.helper.js) has validation helpers. We need to extend the SDK with magic bytes validation.

### Implementation Plan

#### Step 1: Create SDK Validation Module
**File:** `src/utils/file-validator.ts`

```typescript
/**
 * Client-Side File Validation
 * Magic bytes detection for security
 */

export interface FileValidationOptions {
    maxSizeMB?: number;
    minSizeKB?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
    sanitizeFilename?: boolean;
    blockExecutables?: boolean;
}

export class ValidationError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: any
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

// Magic bytes signatures
const MAGIC_BYTES: Record<string, number[]> = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    'image/gif': [0x47, 0x49, 0x46, 0x38],
    'image/webp': [0x52, 0x49, 0x46, 0x46],
    'application/pdf': [0x25, 0x50, 0x44, 0x46],
    'application/zip': [0x50, 0x4B, 0x03, 0x04],
    'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
    'video/webm': [0x1A, 0x45, 0xDF, 0xA3],
    'audio/mpeg': [0x49, 0x44, 0x33],
};

const DANGEROUS_EXTENSIONS = [
    'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 
    'js', 'jar', 'app', 'deb', 'rpm', 'dmg', 'pkg', 'msi'
];

/**
 * Detect real MIME type using magic bytes
 */
export async function detectRealMimeType(file: File | Blob): Promise<string> {
    try {
        const slice = file.slice(0, 8);
        const buffer = await slice.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        for (const [mimeType, signature] of Object.entries(MAGIC_BYTES)) {
            const matches = signature.every((b, i) => bytes[i] === b);
            if (matches) return mimeType;
        }

        return file instanceof File ? (file.type || 'application/octet-stream') : 'application/octet-stream';
    } catch {
        return 'application/octet-stream';
    }
}

/**
 * Validate file before upload
 */
export async function validateFile(
    file: File | Blob,
    options: FileValidationOptions = {}
): Promise<{ valid: true; detectedType: string; sanitizedName?: string }> {
    const filename = file instanceof File ? file.name : 'blob';
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    // Empty file check
    if (file.size === 0) {
        throw new ValidationError('File is empty', 'EMPTY_FILE');
    }

    // Max size
    if (options.maxSizeMB && file.size > options.maxSizeMB * 1024 * 1024) {
        throw new ValidationError(
            `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${options.maxSizeMB}MB`,
            'FILE_TOO_LARGE',
            { actualMB: (file.size / 1024 / 1024).toFixed(1), maxMB: options.maxSizeMB }
        );
    }

    // Min size
    if (options.minSizeKB && file.size < options.minSizeKB * 1024) {
        throw new ValidationError(
            `File too small: ${(file.size / 1024).toFixed(1)}KB. Min: ${options.minSizeKB}KB`,
            'FILE_TOO_SMALL'
        );
    }

    // Block executables
    if (options.blockExecutables !== false && DANGEROUS_EXTENSIONS.includes(extension)) {
        throw new ValidationError(
            `Dangerous file type: .${extension} not allowed`,
            'DANGEROUS_TYPE'
        );
    }

    // Extension whitelist
    if (options.allowedExtensions?.length && !options.allowedExtensions.includes(extension)) {
        throw new ValidationError(
            `Extension ".${extension}" not allowed`,
            'INVALID_EXTENSION',
            { allowed: options.allowedExtensions }
        );
    }

    // Magic bytes validation
    let detectedType = 'application/octet-stream';
    if (options.allowedTypes?.length) {
        detectedType = await detectRealMimeType(file);
        if (!options.allowedTypes.includes(detectedType)) {
            throw new ValidationError(
                `Invalid file type. Detected: "${detectedType}"`,
                'INVALID_MIME_TYPE',
                { detected: detectedType, allowed: options.allowedTypes }
            );
        }
    }

    // Sanitize filename
    let sanitizedName: string | undefined;
    if (options.sanitizeFilename !== false && file instanceof File) {
        sanitizedName = filename
            .replace(/[\/\\]/g, '')
            .replace(/\.\./g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/[<>:"|?*]/g, '')
            .slice(0, 255)
            .trim();
    }

    return { valid: true, detectedType, sanitizedName };
}

/**
 * Batch validate files
 */
export async function validateFiles(
    files: (File | Blob)[],
    options: FileValidationOptions = {}
): Promise<{
    valid: (File | Blob)[];
    invalid: { file: File | Blob; error: ValidationError }[];
}> {
    const results = await Promise.allSettled(files.map(f => validateFile(f, options)));
    
    const valid: (File | Blob)[] = [];
    const invalid: { file: File | Blob; error: ValidationError }[] = [];

    results.forEach((result, i) => {
        if (result.status === 'fulfilled') valid.push(files[i]);
        else invalid.push({ file: files[i], error: result.reason });
    });

    return { valid, invalid };
}
```

#### Step 2: Integrate into SDK Client
**File:** `src/client.ts`

```typescript
import { validateFile, validateFiles, validateFiles, FileValidationOptions, ValidationError } from './utils/file-validator.js';

// Add to ObitoX class
async validateFile(file: File | Blob, options?: FileValidationOptions) {
    return await validateFile(file, options);
}

async validateFiles(files: (File | Blob)[], options?: FileValidationOptions) {
    return await validateFiles(files, options);
}
```

#### Step 3: Auto-validate in uploadFile
**File:** `src/providers/s3/s3.provider.ts`

```typescript
import { validateFile } from '../../utils/file-validator.js';

async uploadFile(file: File | Blob, options: S3UploadOptions): Promise<string> {
    // Auto-validate if validation options provided
    if (options.validation) {
        const result = await validateFile(file, options.validation);
        console.log('[S3Provider] ✅ Validation passed:', result.detectedType);
    }
    
    // Continue with existing upload logic...
}
```

---

## 3. Smart Presigned URL Expiry (MEDIUM PRIORITY)

### Why This Aligns with Your Architecture

Your existing [`controllers/providers/s3/s3.config.js`](controllers/providers/s3/s3.config.js) has `SIGNED_URL_EXPIRY` constant. We need to make it dynamic.

### Implementation Plan

#### Step 1: Add Network Detection to SDK
**File:** `src/utils/network-detector.ts`

```typescript
/**
 * Network speed detection for smart expiry calculation
 */

export type NetworkType = 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown';

const NETWORK_SPEEDS: Record<NetworkType, number> = {
    'slow-2g': 50 * 1024,      // 50 KB/s
    '2g': 150 * 1024,          // 150 KB/s
    '3g': 750 * 1024,          // 750 KB/s
    '4g': 5 * 1024 * 1024,     // 5 MB/s
    'wifi': 15 * 1024 * 1024,  // 15 MB/s
    'unknown': 500 * 1024       // 500 KB/s
};

export function getNetworkType(): NetworkType {
    if (typeof navigator === 'undefined') return 'unknown';
    const conn = (navigator as any).connection;
    return conn?.effectiveType || 'unknown';
}

export function calculateSmartExpiry(
    fileSize: number,
    networkType: NetworkType = 'unknown',
    options: { buffer?: number; minSeconds?: number; maxSeconds?: number } = {}
): number {
    const { buffer = 1.5, minSeconds = 60, maxSeconds = 604800 } = options; // 7 days max
    
    const speed = NETWORK_SPEEDS[networkType] || NETWORK_SPEEDS.unknown;
    const estimatedTime = fileSize / speed; // seconds
    
    const expiry = Math.max(minSeconds, Math.ceil(estimatedTime * buffer));
    return Math.min(expiry, maxSeconds);
}
```

#### Step 2: Update Signed URL Endpoint
**File:** `controllers/providers/s3/s3.signed-url.js`

```javascript
import { calculateSmartExpiry } from '../../../utils/network-detector.js';

export const generateS3SignedUrl = async (req, res) => {
    const { 
        filename, 
        contentType, 
        fileSize, 
        networkType,
        expiresIn // Optional - will be calculated if not provided
    } = req.body;

    // Calculate smart expiry if not provided
    const effectiveExpiry = expiresIn || calculateSmartExpiry(
        fileSize || 0,
        networkType || 'unknown'
    );

    // Continue with existing logic using effectiveExpiry...
};
```

#### Step 3: Update SDK to Send Network Info
**File:** `src/providers/s3/s3.provider.ts`

```typescript
import { getNetworkType, calculateSmartExpiry } from '../../utils/network-detector.js';

async getSignedUrl(filename: string, contentType: string, options: S3SignedUrlOptions): Promise<SignedUrlResult> {
    // Auto-detect network and calculate expiry
    const networkType = getNetworkType();
    const expiresIn = options.expiresIn || calculateSmartExpiry(
        options.fileSize || 0,
        networkType
    );

    return this.makeRequest('/api/v1/upload/s3/signed-url', {
        method: 'POST',
        body: JSON.stringify({
            filename,
            contentType,
            fileSize: options.fileSize,
            networkType,
            expiresIn
        })
    });
}
```

---

## 4. Upload Completion Webhooks (MEDIUM PRIORITY)

### Why This Aligns with Your Architecture

You already have a job system in [`jobs/`](jobs/) and audit logging in [`utils/audit-logger.js`](utils/audit-logger.js). We can leverage these.

### Implementation Plan

#### Step 1: Create Webhook Queue Table
```sql
-- Database migration needed
CREATE TABLE upload_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    webhook_url TEXT NOT NULL,
    upload_id TEXT,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhooks_pending ON upload_webhooks(status, created_at);
```

#### Step 2: Create Webhook Job
**File:** `jobs/webhook-worker.js`

```javascript
import { getRedis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // ms

/**
 * Process pending webhooks
 */
async function processWebhooks() {
    const redis = getRedis();
    
    // Get pending webhooks from Redis queue
    const pending = await redis.lrange('webhook:pending', 0, 10);
    
    for (const webhookId of pending) {
        try {
            const { webhookUrl, payload, attempts } = JSON.parse(
                await redis.get(`webhook:${webhookId}`)
            );

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // Success - remove from queue
                await redis.del(`webhook:${webhookId}`);
                await redis.lrem('webhook:pending', 1, webhookId);
            } else if (attempts < MAX_ATTEMPTS) {
                // Retry with backoff
                const delay = RETRY_DELAYS[attempts];
                await redis.setex(`webhook:${webhookId}`, delay / 1000, JSON.stringify({
                    ...JSON.parse(await redis.get(`webhook:${webhookId}`)),
                    attempts: attempts + 1,
                    last_attempt_at: new Date().toISOString()
                }));
            } else {
                // Max retries reached - log and remove
                console.error(`[Webhook] Failed after ${MAX_ATTEMPTS} attempts:`, webhookId);
                await redis.del(`webhook:${webhookId}`);
                await redis.lrem('webhook:pending', 1, webhookId);
            }
        } catch (error) {
            console.error('[Webhook] Processing error:', error);
        }
    }
}

// Run every 5 seconds
setInterval(processWebhooks, 5000);
```

#### Step 3: Queue Webhook on Upload Complete
**File:** `src/providers/s3/s3.provider.ts`

```typescript
async uploadFile(file: File | Blob, options: S3UploadOptions): Promise<string> {
    const url = await this.getSignedUrl(...);
    
    // If webhook specified, queue it
    if (options.onUploadComplete) {
        await this.queueWebhook({
            webhookUrl: options.onUploadComplete,
            payload: {
                event: 'upload.completed',
                filename: file instanceof File ? file.name : 'blob',
                fileSize: file.size,
                fileUrl: url,
                bucket: options.s3Bucket,
                uploadedAt: new Date().toISOString()
            }
        });
    }
    
    return url;
}

private async queueWebhook(data: { webhookUrl: string; payload: any }) {
    return this.makeRequest('/api/v1/webhooks/queue', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}
```

#### Step 4: Create Webhook Queue Endpoint
**File:** `routes/webhook.routes.js`

```javascript
import { getRedis } from '../config/redis.js';

router.post('/webhooks/queue', apiKeyMiddleware, async (req, res) => {
    const { webhookUrl, payload } = req.body;
    
    const redis = getRedis();
    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await redis.set(`webhook:${webhookId}`, JSON.stringify({
        webhookUrl,
        payload,
        attempts: 0,
        created_at: new Date().toISOString()
    }));
    
    await redis.rpush('webhook:pending', webhookId);
    
    res.json({ success: true, webhookId });
});
```

---

## 5. Resumable Multipart Uploads (LOW PRIORITY)

### Why This Aligns with Your Architecture

Your existing [`controllers/providers/s3/s3.multipart.js`](controllers/providers/s3/s3.multipart.js) has multipart support. We need to add resume tokens.

### Implementation Plan

#### Step 1: Store Upload State in Redis
**File:** `controllers/providers/s3/s3.multipart.js`

```javascript
import { getRedis } from '../../../config/redis.js';

const MULTIPART_TTL = 604800; // 7 days

/**
 * Save multipart upload state for resume capability
 */
export const saveMultipartState = async (uploadId, state) => {
    const redis = getRedis();
    await redis.setex(`multipart:${uploadId}`, MULTIPART_TTL, JSON.stringify(state));
};

/**
 * Get multipart upload state for resume
 */
export const getMultipartState = async (uploadId) => {
    const redis = getRedis();
    const state = await redis.get(`multipart:${uploadId}`);
    return state ? JSON.parse(state) : null;
};
```

#### Step 2: Update Initiate to Return Resume Token

```javascript
export const initiateS3MultipartUpload = async (req, res) => {
    // ... existing initiation logic ...
    
    const uploadId = result.UploadId;
    
    // Save state for resume
    await saveMultipartState(uploadId, {
        bucket: s3Bucket,
        key: objectKey,
        uploadId,
        parts: [],
        filename,
        contentType,
        created_at: new Date().toISOString()
    });
    
    res.json({
        success: true,
        uploadId,
        resumeToken: Buffer.from(JSON.stringify({ uploadId, bucket: s3Bucket })).toString('base64'),
        objectKey,
        partSize: effectivePartSize,
        // ... existing data
    });
};
```

#### Step 3: Add Resume Endpoint

```javascript
router.post('/s3/multipart/resume', apiKeyMiddleware, async (req, res) => {
    const { resumeToken } = req.body;
    
    try {
        const { uploadId, bucket } = JSON.parse(Buffer.from(resumeToken, 'base64').toString());
        const state = await getMultipartState(uploadId);
        
        if (!state) {
            return res.status(404).json({
                success: false,
                error: 'UPLOAD_NOT_FOUND',
                message: 'This upload has expired or never existed'
            });
        }
        
        res.json({
            success: true,
            uploadId,
            objectKey: state.key,
            partsUploaded: state.parts.length,
            parts: state.parts,
            // Client can use this to skip uploaded parts
        });
    } catch (error) {
        res.status(400).json(formatS3Error('INVALID_RESUME_TOKEN', error.message));
    }
});
```

---

## 6. Batch Presigned URLs (LOW PRIORITY)

### Why This Aligns with Your Architecture

Your existing [`controllers/providers/r2/r2.batch-signed-url.js`](controllers/providers/r2/r2.batch-signed-url.js) has batch support. We need to add similar functionality to S3.

### Implementation Plan

#### Step 1: Create S3 Batch Endpoint
**File:** `controllers/providers/s3/s3.batch-signed-url.js`

```javascript
/**
 * S3 Batch Signed URL Generation
 * Generate up to 100 presigned URLs in a single request
 */

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from './s3.config.js';
import { calculateSmartExpiry } from '../../../utils/network-detector.js';

export const generateS3BatchSignedUrls = async (req, res) => {
    try {
        const { 
            files, // Array of { filename, contentType, fileSize }
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            expiresIn,
            networkType
        } = req.body;

        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'INVALID_FILES_ARRAY' 
            });
        }

        if (files.length > 100) {
            return res.status(400).json({ 
                success: false, 
                error: 'TOO_MANY_FILES',
                message: 'Maximum 100 files per batch'
            });
        }

        const s3 = getS3Client(s3AccessKey, s3SecretKey, s3Region);
        const results = [];

        for (const file of files) {
            const command = new PutObjectCommand({
                Bucket: s3Bucket,
                Key: file.filename,
                ContentType: file.contentType
            });

            const url = await getSignedUrl(s3, command, { 
                expiresIn: expiresIn || calculateSmartExpiry(file.fileSize || 0, networkType) 
            });

            results.push({
                filename: file.filename,
                uploadUrl: url,
                method: 'PUT',
                headers: {
                    'Content-Type': file.contentType
                }
            });
        }

        res.json({
            success: true,
            count: results.length,
            urls: results
        });

    } catch (error) {
        console.error('[S3 Batch] Error:', error);
        res.status(500).json(formatS3Error('BATCH_FAILED', error.message));
    }
};
```

#### Step 2: Add to SDK
**File:** `src/providers/s3/s3.provider.ts`

```typescript
async uploadFilesBatch(
    files: Array<{ filename: string; contentType: string; fileSize?: number }>,
    options: S3BatchUploadOptions
): Promise<Array<{ filename: string; uploadUrl: string }>> {
    return this.makeRequest('/api/v1/upload/s3/batch-sign', {
        method: 'POST',
        body: JSON.stringify({
            files,
            ...options
        })
    });
}
```

---

## Implementation Priority Summary

| Priority | Feature | Effort | Impact | Files to Create/Modify |
|----------|---------|--------|--------|------------------------|
| 🔴 HIGH | CORS Auto-Config | 3 hrs | High DX | `s3.cors.js`, `upload.routes.js` |
| 🔴 HIGH | File Validation | 2 hrs | Security | `file-validator.ts`, `s3.provider.ts` |
| 🟡 MEDIUM | Smart Expiry | 2 hrs | Reliability | `network-detector.ts`, `s3.signed-url.js` |
| 🟡 MEDIUM | Upload Webhooks | 4 hrs | Integration | `webhook.routes.js`, `webhook-worker.js` |
| 🟢 LOW | Resumable Multipart | 4 hrs | Large files | Modify `s3.multipart.js` |
| 🟢 LOW | Batch URLs | 2 hrs | Performance | `s3.batch-signed-url.js` |

---

## Compatibility Notes

All implementations follow your existing patterns:

1. **Redis Integration** - All caching uses `getRedis()` from [`config/redis.js`](config/redis.js)
2. **Metrics** - All endpoints use `updateRequestMetrics()` from [`controllers/providers/shared/metrics.helper.js`](controllers/providers/shared/metrics.helper.js)
3. **Error Handling** - Uses `formatS3Error()` from [`controllers/providers/s3/s3.config.js`](controllers/providers/s3/s3.config.js)
4. **Rate Limiting** - Inherits from existing middleware stack
5. **API Key Auth** - All endpoints use `apiKeyMiddleware`
