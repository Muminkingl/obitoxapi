# Smart Expiry SDK Integration Plan

## Overview
Add optional `networkInfo` parameter to upload options for smart presigned URL expiry calculation.

## Goals
- **Minimal API change**: Single optional `networkInfo` field in `UploadOptions`
- **Auto-detection**: Automatically collect network info if not provided
- **Backward compatible**: Existing code works without changes

---

## 1. Type Definitions

### File: `src/types/r2.types.ts`

```typescript
/**
 * ✅ NEW: Network information for smart expiry
 */
export interface NetworkInfo {
    /** Network type: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown' */
    effectiveType?: string;
    /** Actual download speed in Mbps (if available) */
    downlink?: number;
    /** Round-trip time in ms */
    rtt?: number;
}

/**
 * ✅ UPDATED: R2 Upload Options with smart expiry support
 */
export interface R2UploadOptions extends BaseUploadOptions {
    /** R2-specific credentials */
    r2AccessKey: string;
    r2SecretKey: string;
    r2AccountId: string;
    r2Bucket: string;
    
    // === 🆕 SMART EXPIRY ===
    /** Optional: Network info for smart presigned URL expiry */
    networkInfo?: NetworkInfo;
}
```

### File: `src/types/s3.types.ts`

```typescript
/**
 * ✅ NEW: Network information for smart expiry (same as R2)
 */
export interface NetworkInfo {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
}

/**
 * ✅ UPDATED: S3 Upload Options with smart expiry support
 */
export interface S3UploadOptions extends BaseUploadOptions {
    /** AWS credentials */
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucket: string;
    
    // === 🆕 SMART EXPIRY ===
    /** Optional: Network info for smart presigned URL expiry */
    networkInfo?: NetworkInfo;
}
```

---

## 2. Utility Function (Auto-detect Network)

### File: `src/utils/network-detector.ts` (NEW)

```typescript
/**
 * Network information detector utility
 * Uses Navigator.connection API when available
 */

/**
 * Get network information from browser
 * Falls back to 'unknown' if not available
 */
export function getNetworkInfo(): NetworkInfo | null {
    // Check if Navigator.connection is available (Chrome/Edge)
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
        const conn = (navigator as any).connection;
        return {
            effectiveType: conn.effectiveType || 'unknown',
            downlink: conn.downlink,
            rtt: conn.rtt
        };
    }
    
    return null;
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * Create network info object with defaults
 */
export function normalizeNetworkInfo(info?: NetworkInfo): NetworkInfo | undefined {
    if (!info) {
        // Auto-detect if in browser
        if (isBrowser()) {
            return getNetworkInfo() || undefined;
        }
        return undefined;
    }
    
    return {
        effectiveType: info.effectiveType || 'unknown',
        downlink: info.downlink,
        rtt: info.rtt
    };
}
```

---

## 3. Provider Updates

### File: `src/providers/r2/r2.provider.ts`

```typescript
import type { R2UploadOptions, NetworkInfo } from '../../types/r2.types.js';
import { normalizeNetworkInfo } from '../../utils/network-detector.js';

export class R2Provider {
    // ... existing code ...

    /**
     * Upload file to R2 with optional network info for smart expiry
     */
    async upload(file: File | Blob, options: R2UploadOptions): Promise<string> {
        // Extract networkInfo and normalize
        const networkInfo = normalizeNetworkInfo(options.networkInfo);
        
        // If networkInfo is available, use it in the signed URL request
        const requestBody: any = {
            filename: options.filename || (file instanceof File ? file.name : 'upload'),
            contentType: file.type || 'application/octet-stream',
            folder: options.folder
        };
        
        // 🆕 Add networkInfo for smart expiry
        if (networkInfo) {
            requestBody.networkInfo = networkInfo;
        }

        const response = await this.makeRequest<R2SignedUrlResponse>(
            '/api/v1/upload/r2/signed-url',
            {
                method: 'POST',
                body: JSON.stringify(requestBody),
            }
        );

        // Upload to presigned URL
        await this.uploadToPresignedUrl(response.uploadUrl, file, {
            contentType: response.data.contentType,
            metadata: response.data.metadata
        });

        return response.publicUrl || response.cdnUrl || response.uploadUrl.split('?')[0];
    }
}
```

### File: `src/providers/s3/s3.provider.ts`

```typescript
import type { S3UploadOptions, NetworkInfo } from '../../types/s3.types.js';
import { normalizeNetworkInfo } from '../../utils/network-detector.js';

export class S3Provider {
    // ... existing code ...

    /**
     * Upload file to S3 with optional network info for smart expiry
     */
    async upload(file: File | Blob, options: S3UploadOptions): Promise<string> {
        // Extract networkInfo and normalize
        const networkInfo = normalizeNetworkInfo(options.networkInfo);
        
        const requestBody: any = {
            filename: options.filename || (file instanceof File ? file.name : 'upload'),
            contentType: file.type || 'application/octet-stream',
            folder: options.folder
        };
        
        // 🆕 Add networkInfo for smart expiry
        if (networkInfo) {
            requestBody.networkInfo = networkInfo;
        }

        const response = await this.makeRequest<S3SignedUrlResponse>(
            '/api/v1/upload/s3/signed-url',
            {
                method: 'POST',
                body: JSON.stringify(requestBody),
            }
        );

        await this.uploadToPresignedUrl(response.uploadUrl, file, {
            contentType: response.data.contentType,
            metadata: response.data.metadata
        });

        return response.publicUrl;
    }
}
```

---

## 4. Usage Examples

### Example 1: Automatic Network Detection (Recommended)
```typescript
import ObitoX from '@obitox/sdk';

const client = new ObitoX({ apiKey: 'ox_...' });

// Network info is auto-detected from browser!
const url = await client.uploadFile(file, {
    provider: 'R2',
    r2AccessKey: '...',
    r2SecretKey: '...',
    r2AccountId: '...',
    r2Bucket: '...'
});
```

### Example 2: Manual Network Info
```typescript
// For Node.js or when you want to override
const url = await client.uploadFile(file, {
    provider: 'S3',
    accessKeyId: '...',
    secretAccessKey: '...',
    region: 'us-east-1',
    bucket: 'my-bucket',
    networkInfo: {
        effectiveType: '4g',
        downlink: 10.5 // Mbps
    }
});
```

### Example 3: Disable Smart Expiry
```typescript
// Pass null to disable auto-detection
const url = await client.uploadFile(file, {
    provider: 'R2',
    r2AccessKey: '...',
    networkInfo: null // Disable smart expiry
});
```

---

## 5. Files to Modify

| File | Changes |
|------|---------|
| `src/types/r2.types.ts` | Add `NetworkInfo` interface, update `R2UploadOptions` |
| `src/types/s3.types.ts` | Add `NetworkInfo` interface, update `S3UploadOptions` |
| `src/utils/network-detector.ts` | **NEW** - Network info utility |
| `src/providers/r2/r2.provider.ts` | Integrate `networkInfo` into request |
| `src/providers/s3/s3.provider.ts` | Integrate `networkInfo` into request |
| `src/types/common.ts` | Export `NetworkInfo` type |

---

## 6. Backward Compatibility

✅ **All existing code works without changes**

- `networkInfo` is optional
- If not provided and in browser: auto-detected
- If not provided and in Node.js: uses default 15min expiry
- `null` explicitly disables smart expiry

---

## 7. Benefits

1. **Better UX**: URLs expire at optimal time (not too early, not too late)
2. **Reduced Frustration**: No "URL expired" errors during upload
3. **Performance**: Less unnecessary longer-lived URLs
4. **Security**: Shorter expiry = more secure by default
5. **Auto-magic**: Works automatically in browsers without extra code
