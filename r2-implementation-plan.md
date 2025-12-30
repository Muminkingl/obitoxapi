# Cloudflare R2 Implementation Plan

## 🎯 Objective
Add Cloudflare R2 as 4th provider with **5-10ms response time** using pure cryptographic signing (AWS SDK v3), NO external API calls, matching existing Vercel/Supabase/Uploadcare architecture exactly.

---

## 📋 Phase 1: Dependencies & Configuration (10 min)

### Install AWS SDK v3
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Why:** S3-compatible signing, pure crypto (NO network calls)

### Create `controllers/providers/r2/r2.config.js`

**Pattern:** Identical to [uploadcare.config.js](file:///d:/MUMIN/ObitoX/obitoxapi/controllers/providers/uploadcare/uploadcare.config.js) / [supabase.config.js](file:///d:/MUMIN/ObitoX/obitoxapi/controllers/providers/supabase/supabase.config.js)

```javascript
// R2 endpoints
export const R2_ENDPOINT_BASE = 'https://{accountId}.r2.cloudflarestorage.com';
export const R2_PUBLIC_URL_BASE = 'https://pub-{accountId}.r2.dev';

// Limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const SIGNED_URL_EXPIRY = 3600; // 1 hour default
export const MAX_EXPIRY = 604800; // 7 days (R2 limit)
export const MIN_EXPIRY = 60; // 1 minute

// Validation helpers
export const validateR2Credentials = (accessKeyId, secretAccessKey, accountId, bucket) => {
  // Format-only validation (1ms, in-memory)
  // Same pattern as validateUploadcareCredentials
};

export const getR2Client = (accountId, accessKeyId, secretAccessKey) => {
  // Returns configured S3Client
  // Pure crypto, NO API call
};
```

**Following Rules:** #2, #5, #12

---

## 📋 Phase 2: Core Operations (Modular Files)

### File Structure (Match Existing Pattern)
```
controllers/providers/r2/
├── r2.config.js          (Constants, validation, client factory)
├── r2.helpers.js         (Shared utilities, metrics)
├── r2.signed-url.js      (⚡ PRIMARY - 5-10ms pure crypto)
├── r2.upload.js          (Server-side upload - optional)
├── r2.delete.js          (Delete objects)
├── r2.download.js        (Get file info/download URL)
├── r2.list.js            (List bucket objects)
├── cache/
│   ├── memory-guard.js   (Reuse from Uploadcare)
│   └── redis-cache.js    (Reuse from Uploadcare)
└── index.js              (Export all operations)
```

**Following Rules:** #5, #13, #14

---

## 📋 Phase 3: Signed URL Generation (CRITICAL)

### `r2.signed-url.js` Implementation

**Architecture:**
```
Request → Memory Guard (1ms) → Redis Rate Limit (5ms) → Generate Signed URL (5-10ms) → Response
Total: 11-16ms ✅
```

**Key Points:**
1. ✅ Accept credentials in request body (Rule #2)
2. ✅ Validate format only - NO API call (Rule #1)
3. ✅ Use AWS SDK v3 `getSignedUrl` - pure crypto (Rule #1)
4. ✅ Return EXACT same format as Vercel (Rule #3)
5. ✅ Non-blocking metrics (Rule #6)
6. ✅ Cache hit tracking (Rule #4)

**Response Format (IDENTICAL to Vercel):**
```json
{
  "success": true,
  "uploadUrl": "https://....r2.cloudflarestorage.com/...",
  "publicUrl": "https://pub-{accountId}.r2.dev/filename.jpg",
  "uploadId": "unique-id",
  "provider": "r2",
  "expiresIn": 3600
}
```

**Performance Target:** 5-15ms P95

**Following Rules:** #1, #2, #3, #5, #6, #12

---

## 📋 Phase 4: Additional Operations

### 1. `r2.delete.js`
- Uses AWS SDK `DeleteObjectCommand`
- Same pattern as [uploadcare.delete.js](file:///d:/MUMIN/ObitoX/obitoxapi/controllers/providers/uploadcare/uploadcare.delete.js)
- Cache invalidation after delete
- Non-blocking metrics

### 2. `r2.download.js`
- Returns public URL and file metadata
- NO external API call for public buckets
- Optional: Get object metadata with `HeadObjectCommand`
- Cache file metadata

### 3. `r2.list.js`
- Uses `ListObjectsV2Command`
- Pagination support (match Uploadcare pattern)
- Cache list results (short TTL)

### 4. `r2.upload.js` (Server-side, Optional)
-  Uses `PutObjectCommand`
- For server-to-server uploads
- Same pattern as [supabase.upload.js](file:///d:/MUMIN/ObitoX/obitoxapi/controllers/providers/supabase/supabase.upload.js)

**Following Rules:** #5, #6

---

## 📋 Phase 5: Request Body Pattern

### Endpoint: `POST /api/v1/upload/r2/signed-url`

**Request Body:**
```json
{
  "filename": "photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1024000,
  "r2AccessKeyId": "xxx",
  "r2SecretAccessKey": "xxx",
  "r2AccountId": "abc123",
  "r2Bucket": "my-bucket",
  "r2PublicUrl": "https://pub-abc123.r2.dev",  // Optional
  "expiresIn": 3600  // Optional, default 1 hour
}
```

**Validation (Format Only - 1ms):**
- Access Key ID: 20 characters, alphanumeric
- Secret Access Key: 40 characters
- Account ID: 32 characters hex
- Bucket: Valid S3 bucket name
- Expires In: 60-604800 seconds

**NO external API calls to validate!**

**Following Rules:** #2, #5, #12

---

## 📋 Phase 6: Error Handling

### Error Response Format (Match Existing)

**Example - Invalid Credentials Format:**
```json
{
  "success": false,
  "error": "INVALID_R2_CREDENTIALS",
  "message": "R2 Access Key ID must be 20 characters",
  "hint": "Check your R2 credentials in Cloudflare Dashboard → R2 → Manage R2 API Tokens",
  "docs": "https://docs.cloudflare.com/r2/api/s3/tokens/",
  "provider": "r2"
}
```

**Example - Upload Failed (from R2):**
```json
{
  "success": false,
  "error": "R2_ACCESS_DENIED",
  "message": "R2 returned 403 Forbidden - check your credentials and bucket permissions",
  "hint": "Verify your R2 token has 'Object Read and Write' permissions",
  "r2Error": "AccessDenied",
  "provider": "r2"
}
```

**Following Rules:** #8, #10

---

## 📋 Phase 7: Metrics & Analytics

### Track in Existing `provider_usage` Table

**Same metrics as Vercel/Supabase/Uploadcare:**
```javascript
{
  api_key_id: "xxx",
  provider: "r2",
  upload_count: 1,
  total_file_size: 1024000,
  last_used_at: "2025-01-01T00:00:00Z"
}
```

**Non-Blocking Pattern:**
```javascript
updateR2Metrics(apiKeyId, userId, 'r2', 'success', fileSize)
  .catch(() => {}); // Silent fail, don't block response
```

**Following Rules:** #6, #9

---

## 📋 Phase 8: Caching Strategy

### Multi-Layer Cache (Reuse from Uploadcare)

**Layer 1: Memory Guard**
- Rate limiting only
- No credential caching (they come in request body)

**Layer 2: Redis**  
- Cache API key validation (reuse existing)
- Cache R2 list results (5-min TTL)
- Cache file metadata (10-min TTL)

**What NOT to cache:**
- Credentials (per-request in body)
- Signed URLs (must be unique each time)

**Following Rules:** #4, #11

---

## 📋 Phase 9: Routes Integration

### Update [routes/upload.routes.js](file:///d:/MUMIN/ObitoX/obitoxapi/routes/upload.routes.js)

**Add R2 routes (match existing pattern):**
```javascript
import {
  generateR2SignedUrl,
  deleteR2File,
  downloadR2File,
  listR2Files,
  uploadToR2
} from '../controllers/providers/r2/index.js';

// R2 routes
router.post('/r2/signed-url', validateApiKey, generateR2SignedUrl);
router.post('/r2/delete', validateApiKey, deleteR2File);
router.post('/r2/download', validateApiKey, downloadR2File);
router.post('/r2/list', validateApiKey, listR2Files);
router.post('/r2/upload', validateApiKey, uploadToR2);
```

**Middleware automatically applied:**
- ✅ Arcjet security
- ✅ API key validation
- ✅ Error handling
- ✅ CORS
- ✅ Rate limiting

**Following Rules:** #13, #14

---

## 📋 Phase 10: Testing Strategy

### Test Order (Rule #10)

**1. Test Failures FIRST:**
```bash
# Invalid Access Key ID
curl -X POST /api/v1/upload/r2/signed-url \
  -d '{"r2AccessKeyId": "invalid"}'
# Expected: Clear error message

# Invalid Secret Key
# Expected: 403 from R2 when client tries to upload

# Bucket doesn't exist  
# Expected: 404 from R2 when client tries to upload

# Missing permissions
# Expected: 403 from R2 with clear message
```

**2. Test Happy Path:**
```bash
# Valid credentials
curl -X POST /api/v1/upload/r2/signed-url \
  -d '{"filename": "test.jpg", "r2AccessKeyId": "...", ...}'
# Expected: 200, signed URL, ~10ms response time
```

**3. Performance Test:**
```bash
# Measure response time
for i in {1..100}; do
  time curl -X POST /api/v1/upload/r2/signed-url ...
done
# Target: P95 < 15ms
```

**Following Rules:** #10

---

## 📋 Phase 11: Documentation

### API Documentation

**Endpoint:** `POST /api/v1/upload/r2/signed-url`

**Description:**  
Generate a presigned URL for uploading files to Cloudflare R2 storage. Uses AWS S3-compatible API with pure cryptographic signing (5-10ms response time, NO external API calls).

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filename | string | Yes | File name with extension |
| contentType | string | Yes | MIME type (e.g., image/jpeg) |
| fileSize | number | No | File size in bytes |
| r2AccessKeyId | string | Yes | R2 Access Key ID (20 chars) |
| r2SecretAccessKey | string | Yes | R2 Secret Access Key (40 chars) |
| r2AccountId | string | Yes | R2 Account ID (32 chars) |
| r2Bucket | string | Yes | R2 bucket name |
| r2PublicUrl | string | No | Custom public URL base |
| expiresIn | number | No | URL expiry in seconds (60-604800) |

**Response (200 OK):**
```json
{
  "success": true,
  "uploadUrl": "https://{accountId}.r2.cloudflarestorage.com/...",
  "publicUrl": "https://pub-{accountId}.r2.dev/filename.jpg",
  "uploadId": "unique-id",
  "provider": "r2",
  "expiresIn": 3600,
  "performance": {
    "totalTime": "12ms"
  }
}
```

**Following Rules:** #8

---

## 📋 Phase 12: Implementation Order

**Day 1: Foundation (2-3 hours)**
1. ✅ Install AWS SDK v3
2. ✅ Create `r2.config.js` - validation helpers
3. ✅ Create `r2.helpers.js` - metrics, utilities
4. ✅ Copy cache files from Uploadcare

**Day 1: Core Signed URL (2-3 hours)**
5. ✅ Create `r2.signed-url.js`
6. ✅ Test with  invalid credentials (errors)
7. ✅ Test with valid credentials (happy path)
8. ✅ Measure response time (target: <15ms P95)

**Day 2: Additional Operations (3-4 hours)**
9. ✅ Create `r2.delete.js`
10. ✅ Create `r2.download.js`
11. ✅ Create `r2.list.js`
12. ✅ Create `r2.upload.js` (optional, server-side)

**Day 2: Integration (1-2 hours)**
13. ✅ Update [routes/upload.routes.js](file:///d:/MUMIN/ObitoX/obitoxapi/routes/upload.routes.js)
14. ✅ Add R2 to analytics tracking
15. ✅ Test all endpoints

**Day 3: Documentation & Final Testing (2 hours)**
16. ✅ Write API documentation
17. ✅ Create test suite
18. ✅ Performance benchmarks
19. ✅ Deploy to production

**Total:** ~10-14 hours of focused work

**Following Rules:** #15

---

## 🎯 Success Criteria Checklist

### Performance
- [ ] Response time: 5-15ms P95 ✅
- [ ] Zero external API calls in signed URL generation ✅
- [ ] Memory Guard: <2ms ✅
- [ ] Redis check: <5ms ✅
- [ ] Crypto signing: 5-10ms ✅

### Architecture
- [ ] Follows exact same pattern as Vercel controller ✅
- [ ] Response format identical to other providers ✅
- [ ] Non-blocking analytics ✅
- [ ] Multi-layer caching applied ✅
- [ ] Existing middleware auto-applied ✅

### Quality
- [ ] All 15 rules followed ✅
- [ ] Error messages are clear and actionable ✅
- [ ] Credentials validated once (format only) ✅
- [ ] Same metrics as other providers ✅
- [ ] Invalid credentials tested first ✅

---

## 🔥 Key Differentiators

### Why R2 > Vercel Blob

| Feature | Vercel Blob | Cloudflare R2 |
|---------|-------------|---------------|
| **Response Time** | 220ms (API call) | 5-10ms (pure crypto) |
| **Network Calls** | 1 per request | 0 per request |
| **Egress Fees** | $0.15/GB | $0 (FREE) |
| **CDN | Vercel Edge | Cloudflare (faster) |
| **Speed Advantage** | Baseline | **20-40x faster** |

### Marketing Message
> **"Cloudflare R2: 20x faster than Vercel (5-10ms), zero egress fees, global Cloudflare CDN. Upload API that scales."**

---

## 📊 Metrics to Track

### Performance Metrics
```javascript
{
  "r2_response_time_p50": "8ms",
  "r2_response_time_p95": "12ms",
  "r2_response_time_p99": "18ms",
  "r2_cache_hit_rate": "96%",
  "r2_api_calls_saved": "10,247 per day"
}
```

### Business Metrics
```javascript
{
  "r2_uploads_per_day": 15000,
  "r2_total_storage_gb": 250,
  "r2_egress_saved_usd": "$37.50/day",  // vs S3
  "r2_active_users": 342
}
```

---

## ⚠️ Critical Reminders

### DO NOT:
- ❌ Call Cloudflare API to validate credentials
- ❌ Check if bucket exists before returning URL
- ❌ Create separate analytics tables for R2
- ❌ Make blocking database writes
- ❌ Cache credentials (they're in request body)
- ❌ Break existing controller pattern
- ❌ Change response format from other providers

### DO:
- ✅ Use AWS SDK v3 for pure crypto signing
- ✅ Validate credential FORMAT only (1ms)
- ✅ Let R2 validate credentials naturally (on upload)
- ✅ Return clear error messages with hints
- ✅ Track same metrics as other providers
- ✅ Reuse existing cache/middleware/helpers
- ✅ Test failures before happy path
- ✅ Match Vercel controller pattern exactly

---

## 🚀 Ready to Implement!

**I have read and understood all 15 golden rules.**

**Pre-Flight Checklist: 15/15 ✅**

- [x] I understand R2 uses S3-compatible API
- [x] I will NOT call Cloudflare API on every request
- [x] I will validate credentials format only
- [x] I will follow exact same controller pattern as Vercel
- [x] I will keep response format identical
- [x] I will cache R2 credentials with API key
- [x] I will track same metrics as other providers
- [x] I will add non-blocking analytics
- [x] I will handle errors with clear messages
- [x] I will test invalid credentials first
- [x] I will invalidate cache on credential changes
- [x] I will add to existing route structure
- [x] I will leverage existing middleware
- [x] I will test API before updating SDK
- [x] I will NOT create separate analytics tables

**Next Step:** Get your approval on this plan, then start implementation! 🚀
