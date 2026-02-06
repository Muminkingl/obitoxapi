# SDK CORS Auto-Configuration Implementation Plan

## Overview

Add CORS auto-configuration to the ObitoX SDK, enabling developers to configure CORS on their S3 buckets directly from their code.

## Architecture

```
Developer Code
      |
      v
S3Provider.configureCors()  --->  ObitoX API  --->  AWS S3 Bucket
      |                             /s3/cors/setup           CORS Configured
      v
Developer can now upload directly!
```

---

## Files to Modify

### 1. `src/types/s3.types.ts`

**Add CORS-related types:**

```typescript
// S3 CORS Configuration Options
export interface S3CorsConfigOptions {
    /** AWS Access Key ID */
    s3AccessKey: string;

    /** AWS Secret Access Key */
    s3SecretKey: string;

    /** S3 Bucket name */
    s3Bucket: string;

    /** AWS Region (default: us-east-1) */
    s3Region?: string;

    /** Allowed origins for CORS */
    allowedOrigins: string[];
}

// S3 CORS Configuration Response
export interface S3CorsConfigResponse {
    /** Request succeeded */
    success: boolean;

    /** Message from API */
    message: string;

    /** Applied CORS configuration */
    configuration: {
        CORSRules: Array<{
            AllowedHeaders: string[];
            AllowedMethods: string[];
            AllowedOrigins: string[];
            ExposeHeaders: string[];
            MaxAgeSeconds: number;
        }>;
    };
}

// S3 CORS Verification Response
export interface S3CorsVerifyResponse {
    /** Whether CORS is configured */
    configured: boolean;

    /** CORS rules (if configured) */
    rules: Array<{
        AllowedMethods: string[];
        AllowedOrigins: string[];
        ExposeHeaders: string[];
    }>;

    /** Any issues found */
    issues: string[];

    /** Recommendation */
    recommendation: string;
}
```

### 2. `src/providers/s3/s3.provider.ts`

**Add CORS configuration methods:**

```typescript
/**
 * Configure CORS on S3 bucket
 * 
 * This method automatically configures CORS on the developer's S3 bucket,
 * enabling direct browser uploads without CORS errors.
 * 
 * @param options - CORS configuration options
 * @returns Promise resolving to the applied configuration
 * 
 * @example
 * ```typescript
 * const provider = new S3Provider('ox-api-key', 'https://api.obitox.io');
 * 
 * await provider.configureCors({
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'xxx...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   allowedOrigins: ['https://myapp.com', 'https://www.myapp.com']
 * });
 * 
 * console.log('CORS configured successfully!');
 * ```
 */
async configureCors(options: S3CorsConfigOptions): Promise<S3CorsConfigResponse> {
    const response = await this.makeRequest<S3CorsConfigResponse>(
        '/api/v1/upload/s3/cors/setup',
        {
            method: 'POST',
            body: JSON.stringify({
                s3AccessKey: options.s3AccessKey,
                s3SecretKey: options.s3SecretKey,
                s3Bucket: options.s3Bucket,
                s3Region: options.s3Region || 'us-east-1',
                allowedOrigins: options.allowedOrigins
            }),
        }
    );

    if (!response.success) {
        throw new Error('Failed to configure CORS on S3 bucket');
    }

    console.log(`✅ CORS configured for bucket "${options.s3Bucket}"`);
    return response;
}

/**
 * Verify CORS configuration on S3 bucket
 * 
 * @param options - S3 credentials and bucket info
 * @returns Promise resolving to verification result
 * 
 * @example
 * ```typescript
 * const result = await provider.verifyCors({
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'xxx...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1'
 * });
 * 
 * if (result.configured) {
 *   console.log('CORS is configured correctly');
 * } else {
 *   console.log('CORS not configured');
 *   console.log(result.recommendation);
 * }
 * ```
 */
async verifyCors(options: {
    s3AccessKey: string;
    s3SecretKey: string;
    s3Bucket: string;
    s3Region?: string;
}): Promise<S3CorsVerifyResponse> {
    const response = await this.makeRequest<S3CorsVerifyResponse>(
        '/api/v1/upload/s3/cors/verify',
        {
            method: 'POST',
            body: JSON.stringify({
                s3AccessKey: options.s3AccessKey,
                s3SecretKey: options.s3SecretKey,
                s3Bucket: options.s3Bucket,
                s3Region: options.s3Region || 'us-east-1'
            }),
        }
    );

    return response;
}
```

### 3. `src/client.ts`

**Add convenience methods to main client:**

```typescript
/**
 * Configure CORS on S3 bucket
 * 
 * Automatically configures CORS on your S3 bucket for direct browser uploads.
 * 
 * @param options - CORS configuration options
 * @returns Promise resolving to the applied configuration
 * 
 * @example
 * ```typescript
 * const client = new ObitoX({ apiKey: 'ox_xxx...' });
 * 
 * await client.configureS3Cors({
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'xxx...',
 *   s3Bucket: 'my-uploads',
 *   s3Region: 'us-east-1',
 *   allowedOrigins: ['https://myapp.com']
 * });
 * ```
 */
async configureS3Cors(options: {
    s3AccessKey: string;
    s3SecretKey: string;
    s3Bucket: string;
    s3Region?: string;
    allowedOrigins: string[];
}): Promise<any> {
    const provider = this.providers.get('S3');
    if (!provider) {
        throw new Error('S3 provider not available');
    }
    return (provider as any).configureCors(options);
}

/**
 * Verify CORS configuration on S3 bucket
 * 
 * @param options - S3 credentials and bucket info
 * @returns Promise resolving to verification result
 * 
 * @example
 * ```typescript
 * const result = await client.verifyS3Cors({
 *   s3AccessKey: 'AKIA...',
 *   s3SecretKey: 'xxx...',
 *   s3Bucket: 'my-uploads'
 * });
 * 
 * console.log(result.issues); // Any CORS issues found
 * ```
 */
async verifyS3Cors(options: {
    s3AccessKey: string;
    s3SecretKey: string;
    s3Bucket: string;
    s3Region?: string;
}): Promise<any> {
    const provider = this.providers.get('S3');
    if (!provider) {
        throw new Error('S3 provider not available');
    }
    return (provider as any).verifyCors(options);
}
```

### 4. `src/types/index.ts`

**Export new types:**

```typescript
export type {
    S3CorsConfigOptions,
    S3CorsConfigResponse,
    S3CorsVerifyResponse
} from './s3.types.js';
```

---

## Usage Examples

### Basic CORS Setup

```typescript
import ObitoX from '@obitox/sdk';

const client = new ObitoX({ apiKey: 'ox_your_key' });

// Configure CORS on your S3 bucket
await client.configureS3Cors({
    s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
    s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: 'my-uploads-bucket',
    s3Region: 'us-east-1',
    allowedOrigins: [
        'https://myapp.com',
        'https://www.myapp.com'
    ]
});

console.log('CORS configured! You can now upload directly from browser.');
```

### Verify CORS Configuration

```typescript
const result = await client.verifyS3Cors({
    s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
    s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: 'my-uploads-bucket'
});

if (result.configured) {
    console.log('✅ CORS is configured correctly');
    console.log('Allowed origins:', result.rules[0]?.AllowedOrigins);
} else {
    console.log('⚠️  CORS not configured');
    console.log('Recommendation:', result.recommendation);
}
```

### Complete Integration Script

```typescript
import ObitoX from '@obitox/sdk';

async function setupS3ForDirectUploads() {
    const client = new ObitoX({ apiKey: process.env.OBITOX_API_KEY });

    console.log('🚀 Setting up S3 for direct uploads...');

    // Configure CORS
    const corsResult = await client.configureS3Cors({
        s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
        s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3Bucket: process.env.S3_BUCKET,
        s3Region: process.env.AWS_REGION || 'us-east-1',
        allowedOrigins: [
            'https://myapp.com',
            'https://www.myapp.com'
        ]
    });

    console.log('✅ CORS configured:', corsResult.message);

    // Verify configuration
    const verifyResult = await client.verifyS3Cors({
        s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
        s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3Bucket: process.env.S3_BUCKET,
        s3Region: process.env.AWS_REGION || 'us-east-1'
    });

    if (verifyResult.issues.length > 0) {
        console.log('⚠️  Issues found:', verifyResult.issues);
    } else {
        console.log('✅ CORS verification passed!');
    }

    // Now you can upload directly from browser!
    return corsResult;
}

// Run setup
setupS3ForDirectUploads().catch(console.error);
```

---

## Implementation Steps

### Step 1: Add Types
- [ ] Add `S3CorsConfigOptions` interface
- [ ] Add `S3CorsConfigResponse` interface
- [ ] Add `S3CorsVerifyResponse` interface
- [ ] Export from `src/types/index.ts`

### Step 2: Update S3Provider
- [ ] Add `configureCors()` method
- [ ] Add `verifyCors()` method
- [ ] Add type validation for CORS options

### Step 3: Update Main Client
- [ ] Add `configureS3Cors()` convenience method
- [ ] Add `verifyS3Cors()` convenience method

### Step 4: Add Tests
- [ ] Unit tests for `configureCors()`
- [ ] Unit tests for `verifyCors()`
- [ ] Integration tests with mock API

### Step 5: Update Documentation
- [ ] Add usage examples to JSDoc
- [ ] Update README with CORS setup guide
- [ ] Add troubleshooting section

---

## Error Handling

| Error Code | Cause | Solution |
|------------|-------|----------|
| `MISSING_CREDENTIALS` | Missing AWS keys | Provide s3AccessKey and s3SecretKey |
| `ACCESS_DENIED` | IAM permission missing | Add s3:PutBucketCors to IAM policy |
| `CORS_CONFIGURATION_FAILED` | AWS API error | Check bucket name and credentials |

---

## Security Considerations

1. **Credentials**: Developers provide their own AWS credentials - never stored by ObitoX
2. **IAM Permissions**: Requires `s3:PutBucketCors` and `s3:GetBucketCors`
3. **Origin Validation**: Developers specify which origins are allowed
4. **No Backend Storage**: CORS config is stored in AWS, not in ObitoX database
