# SDK Refactor Plan: Provider Instance Pattern

## Overview

Refactor the SDK to support **Provider Instance Pattern** while maintaining **backwards compatibility** with the existing API.

### Current State Assessment: 7/10 ✅ (Functional but verbose)
### Target State Assessment: 9/10 ✅ (Industry standard + backwards compatible)

---

## Architecture Changes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ObitoX Client                                  │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐    │
│   │  NEW API (Provider Instances)                                    │    │
│   │                                                                   │    │
│   │   const r2 = client.r2({ accessKey, secretKey, bucket });        │    │
│   │   await r2.configureCors({ origins: ['https://app.com'] });     │    │
│   │   await r2.uploadFile(file);                                     │    │
│   │                                                                   │    │
│   └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐    │
│   │  OLD API (Still Supported - Backwards Compatible)                │    │
│   │                                                                   │    │
│   │   await client.configureR2Cors({                                │    │
│   │     r2AccessKey, r2SecretKey, r2Bucket, allowedOrigins          │    │
│   │   });                                                            │    │
│   │                                                                   │    │
│   └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Provider Config Types ✅ (Already Exists)
- [x] `R2Config` type (already in `src/types/r2.types.ts`)
- [x] `S3Config` type (already in `src/types/s3.types.ts`)
- [x] `SupabaseConfig` type (already in `src/types/supabase.types.ts`)
- [x] `CorsConfig` type (already in `src/types/r2.types.ts`)

### Step 2: Add Provider Factory Methods to ObitoX Client
**File:** `src/client.ts`

```typescript
// Add these factory methods to ObitoX class:

/**
 * Create R2 provider instance with stored credentials
 */
r2(config: R2Config): R2Provider {
  return new R2Provider(this.apiKey, this.baseUrl, this.apiSecret, config);
}

/**
 * Create S3 provider instance with stored credentials
 */
s3(config: S3Config): S3Provider {
  return new S3Provider(this.apiKey, this.baseUrl, this.apiSecret, config);
}

/**
 * Create Supabase provider instance with stored credentials
 */
supabase(config: SupabaseConfig): SupabaseProvider {
  return new SupabaseProvider(this.apiKey, this.baseUrl, this.apiSecret, config);
}

/**
 * Create Uploadcare provider instance with stored credentials
 */
uploadcare(config: UploadcareConfig): UploadcareProvider {
  return new UploadcareProvider(this.apiKey, this.baseUrl, this.apiSecret, config);
}
```

### Step 3: Update Provider Constructors to Accept Config
**Files:**

- `src/providers/r2/r2.provider.ts`
- `src/providers/s3/s3.provider.ts`
- `src/providers/supabase/supabase.provider.ts`
- `src/providers/uploadcare/uploadcare.provider.ts`


```typescript
// Update R2Provider constructor:
export class R2Provider extends BaseProvider<R2UploadOptions, ..., R2DownloadOptions> {
  private config: R2Config;

  constructor(apiKey: string, baseUrl: string, apiSecret: string | undefined, config?: R2Config) {
    super('R2', apiKey, baseUrl, apiSecret);
    this.config = config || {} as R2Config;
  }

  // Update methods to use this.config for defaults
  async upload(file: File | Blob, options?: R2UploadOptions): Promise<string> {
    const mergedOptions = { ...this.config, ...options };
    // ... use mergedOptions
  }
}
```

### Step 4: Update All Provider Methods to Use Config Defaults
For each provider, update these methods to merge config with options:

**R2 Provider Methods:**
- [ ] `upload()` - Use `this.config` for `r2AccessKey`, `r2SecretKey`, `r2AccountId`, `r2Bucket`
- [ ] `batchUpload()` - Use config defaults
- [ ] `delete()` - Use config defaults
- [ ] `batchDelete()` - Use config defaults
- [ ] `getDownloadUrl()` - Use config defaults
- [ ] `listFiles()` - Use config defaults
- [ ] `getMetadata()` - Use config defaults
- [ ] `generateAccessToken()` - Use config defaults
- [ ] `configureCors()` - **NEW: Uses config for credentials**
- [ ] `verifyCors()` - **NEW: Uses config for credentials**

**S3 Provider Methods:**
- [ ] `upload()` - Use config defaults
- [ ] `delete()` - Use config defaults
- [ ] `listFiles()` - Use config defaults
- [ ] `getDownloadUrl()` - Use config defaults
- [ ] `getMetadata()` - Use config defaults
- [ ] `configureCors()` - Use config defaults
- [ ] `verifyCors()` - Use config defaults

**Supabase Provider Methods:**
- [ ] `upload()` - Use config defaults
- [ ] `delete()` - Use config defaults
- [ ] `getDownloadUrl()` - Use config defaults
- [ ] `listBuckets()` - Use config defaults

**Uploadcare Provider Methods:**
- [ ] `upload()` - Use config defaults
- [ ] `delete()` - Use config defaults
- [ ] `getDownloadUrl()` - Use config defaults
- [ ] `trackUpload()` - Use config defaults

### Step 5: Update Base Provider Class
**File:** `src/providers/base.provider.ts`

```typescript
export abstract class BaseProvider<...> {
  protected config?: ProviderConfig;

  constructor(
    protected providerName: string,
    protected apiKey: string,
    protected baseUrl: string,
    protected apiSecret?: string,
    config?: ProviderConfig
  ) {
    this.config = config;
  }

  /**
   * Merge provided options with stored config
   */
  protected mergeOptions<T extends Record<string, any>>(options: T): T {
    return { ...this.config, ...options } as T;
  }
}
```

### Step 6: Update Client Methods for Backwards Compatibility
**File:** `src/client.ts`

Keep existing methods but deprecate them (add JSDoc deprecation warning):

```typescript
/**
 * Configure CORS on R2 bucket
 * @deprecated Use `client.r2({ credentials }).configureCors({ options })` instead
 * @example
 * ```typescript
 * // NEW API (recommended):
 * const r2 = client.r2({ accessKey, secretKey, bucket });
 * await r2.configureCors({ origins: ['https://app.com'] });
 *
 * // OLD API (still works):
 * await client.configureR2Cors({ r2AccessKey, r2SecretKey, r2Bucket, allowedOrigins });
 * ```
 */
async configureR2Cors(options: any): Promise<any> {
  // Delegate to provider
  const provider = this.providers.get('R2');
  return (provider as any).configureCors(options);
}
```

### Step 7: Update SDK Exports
**File:** `src/index.ts`

```typescript
export { default } from './client';
export * from './client';

// Export providers for direct instantiation
export { R2Provider } from './providers/r2/r2.provider';
export { S3Provider } from './providers/s3/s3.provider';
export { SupabaseProvider } from './providers/supabase/supabase.provider';
export { UploadcareProvider } from './providers/uploadcare/uploadcare.provider';

// Export types
export * from './types';
```

---

## New API Usage Examples

### Example 1: R2 with Provider Instance
```typescript
import ObitoX from '@obitox/sdk';

const client = new ObitoX({ apiKey: 'ox_xxx...' });

// Create R2 provider instance (credentials stored)
const r2 = client.r2({
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: 'my-uploads'
});

// Configure CORS - NO CREDENTIALS NEEDED!
await r2.configureCors({
  origins: ['https://myapp.com', 'http://localhost:3000'],
  methods: ['PUT', 'GET', 'DELETE'],
  headers: ['*'],
  expose: ['ETag'],
  maxAge: 3600
});

// Verify CORS - NO CREDENTIALS NEEDED!
const result = await r2.verifyCors();

// Upload file - NO CREDENTIALS NEEDED!
const url = await r2.uploadFile(file);

// Batch upload - NO CREDENTIALS NEEDED!
const urls = await r2.uploadFiles(files);

// Delete file - NO CREDENTIALS NEEDED!
await r2.deleteFile(url);
```

### Example 2: S3 with Provider Instance
```typescript
const s3 = client.s3({
  accessKey: process.env.AWS_ACCESS_KEY,
  secretKey: process.env.AWS_SECRET_KEY,
  region: 'us-east-1',
  bucket: 'my-bucket'
});

await s3.configureCors({
  origins: ['https://myapp.com']
});

const url = await s3.uploadFile(file);
```

### Example 3: Supabase with Provider Instance
```typescript
const supabase = client.supabase({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_KEY,
  bucket: 'my-bucket'
});

const url = await supabase.uploadFile(file);
```

### Example 4: Multiple Providers
```typescript
// Different configs for different buckets
const r2Uploads = client.r2({
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: 'uploads'
});

const r2Backups = client.r2({
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: 'backups'
});

// Upload to different buckets - same client!
await r2Uploads.uploadFile(file1);
await r2Backups.uploadFile(file2);
```

### Example 5: Direct Provider Instantiation (Advanced)
```typescript
import { R2Provider } from '@obitox/sdk';

const r2 = new R2Provider({
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: 'my-uploads'
});

await r2.configureCors({ origins: ['https://app.com'] });
const url = await r2.uploadFile(file);
```

---

## Migration Guide for Existing Users

### Before (Old API)
```typescript
await client.configureR2Cors({
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  allowedOrigins: ['https://myapp.com']
});

await client.uploadFile(file, {
  provider: 'R2',
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads'
});
```

### After (New API - Recommended)
```typescript
const r2 = client.r2({
  accessKey: process.env.R2_ACCESS_KEY,
  secretKey: process.env.R2_SECRET_KEY,
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: 'my-uploads'
});

await r2.configureCors({ origins: ['https://myapp.com'] });
await r2.uploadFile(file);
```

### After (Old API - Still Works)
```typescript
// No changes needed - still works!
await client.configureR2Cors({
  r2AccessKey: process.env.R2_ACCESS_KEY,
  r2SecretKey: process.env.R2_SECRET_KEY,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: 'my-uploads',
  allowedOrigins: ['https://myapp.com']
});
```

---

## Testing Plan

1. **Unit Tests** - Test provider methods with and without config
2. **Integration Tests** - Test with real R2/S3/Supabase accounts
3. **Backwards Compatibility Tests** - Ensure old API still works
4. **Type Tests** - Ensure TypeScript types are correct

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Add factory methods to ObitoX client | 1 hour |
| Update R2Provider constructor and methods | 2 hours |
| Update S3Provider constructor and methods | 2 hours |
| Update SupabaseProvider constructor and methods | 1 hour |
| Update UploadcareProvider constructor and methods | 1 hour |
| Add deprecation warnings to old methods | 1 hour |
| Update SDK exports | 30 min |
| Write tests | 3 hours |
| **Total** | **~11-12 hours** |

---

## Files to Modify

1. `src/client.ts` - Add factory methods, deprecate old methods
2. `src/providers/r2/r2.provider.ts` - Update constructor, merge config in methods
3. `src/providers/s3/s3.provider.ts` - Update constructor, merge config in methods
4. `src/providers/supabase/supabase.provider.ts` - Update constructor, merge config in methods
5. `src/providers/uploadcare/uploadcare.provider.ts` - Update constructor, merge config in methods
6. `src/providers/base.provider.ts` - Add mergeOptions helper
7. `src/index.ts` - Export providers directly
8. `src/types/r2.types.ts` - Add `R2Config` type
9. `src/types/s3.types.ts` - Add `S3Config` type
10. `src/types/supabase.types.ts` - Add `SupabaseConfig` type
11. `src/types/uploadcare.types.ts` - Add `UploadcareConfig` type
12. `test/sdk/test-provider-instances.js` - New tests

---

## Success Criteria

✅ Developers can initialize a provider once and reuse it
✅ No credential repetition in method calls
✅ Old API continues to work (backwards compatible)
✅ Clean, type-safe API
✅ Industry standard pattern (like AWS SDK)
✅ Better developer experience
