# SDK File Validation - Implementation Review

## Overall Assessment: ✅ Excellent Choice

Option C (Hybrid) is the right call. Here's why:

| Approach | Pros | Cons |
|----------|------|------|
| **Option A (Auto)** | Zero config | Too opinionated, can't customize |
| **Option B (Explicit)** | Full control | Too verbose, requires 2 steps |
| **✅ Option C (Hybrid)** | Best of both | Slightly more complex to implement |

---

## My Recommendations

### 1. **Simplify the Defaults**

Instead of many options, use sensible presets:

```typescript
interface ValidationPreset {
    'images'     // images only (jpg, png, gif, webp)
    'documents'  // pdf, doc, docx, txt
    'videos'    // mp4, mov, avi, webm
    'any'       // no restrictions (just safety checks)
}
```

Developers can either:
- Use a preset: `validation: 'images'`
- Customize: `validation: { maxSize: 10 * 1024 * 1024, allowedTypes: ['image/*'] }`

### 2. **Validation Should Be Client-Side First**

For performance, do quick checks on the client before hitting the API:

```
Client-side (instant):
├── File size check
├── Extension check  
├── Basic MIME check
└── If fails → reject immediately (no API call)

Server-side (API call):
├── Magic bytes validation
├── Dangerous extension blocking
└── Custom rules
```

### 3. **Add `onError` Callback for UX**

```typescript
const url = await sdk.uploadFile(file, {
    provider: 'R2',
    validation: {
        maxSize: 10 * 1024 * 1024,
        allowedTypes: ['image/*'],
        onError: (errors) => {
            // Show user-friendly toast/modal
            toast.error(errors.join('\n'));
        }
    }
});
```

### 4. **Chunked Upload Consideration**

For large files (>100MB), consider:
- Client-side size check only (don't read magic bytes for 1GB files)
- Server-side validation during multipart upload

### 5. **Filename Sanitization - Important**

The plan mentions sanitization but here's what to implement:

```javascript
function sanitizeFilename(filename) {
    // Remove path traversal
    const basename = filename.split('/').pop().split('\\').pop();
    
    // Remove dangerous characters
    const safe = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Limit length
    return safe.substring(0, 255);
}
```

---

## Implementation Order (Revised)

| Priority | Feature | Why |
|----------|---------|-----|
| **1** | Client-side size + extension check | Instant feedback, no API call needed |
| **2** | Magic bytes detection utility | Reuse existing `utils/file-validator.js` |
| **3** | API validation integration | Send magic bytes with signed URL request |
| **4** | Error callbacks | Better UX for developers |
| **5** | Presets | Simplify common use cases |
| **6** | Standalone export | For developers who want validation only |

---

## Suggested Interface Refinement

```typescript
interface ValidationConfig {
    // Preset OR custom - not both
    preset?: 'images' | 'documents' | 'videos' | 'audio' | 'any';
    
    // Custom rules (if preset not specified)
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
    
    // Safety (always on)
    blockDangerous?: boolean;     // Default: true
    checkMagicBytes?: boolean;   // Default: true
    
    // UX
    onError?: (errors: string[]) => void;
    onWarning?: (warnings: string[]) => void;
}
```

---

## What's Already Built ✅

Looking at your codebase, you already have:

| Component | Status |
|-----------|--------|
| `utils/file-validator.js` | ✅ Magic bytes detection |
| `controllers/validation.controller.js` | ✅ Validation endpoints |
| `src/utils/network-detector.ts` | ✅ Network info (for smart expiry) |

**Recommendation**: Reuse `utils/file-validator.js` directly in the SDK instead of rewriting.

---

## Final Questions to Consider

1. **Default preset**: Should `validation: undefined` enable 'any' (safe only) or 'images' (stricter)?
   - → Suggest: `'safe'` (block dangerous, no type restrictions)

2. **Error handling**: Should invalid files throw an error or return result?
   - → Suggest: Both - throw on 'strict' mode, callback on 'lenient'

3. **Large files**: For files >100MB, skip magic bytes (too slow)?
   - → Suggest: Yes, client-side size check only for large files

---

## Ready to Implement?

If you agree, I can start implementing Option C with these refinements:

1. Create `src/utils/file-validator.ts` (reusing your existing logic)
2. Update `R2UploadOptions` and `S3UploadOptions` with validation config
3. Integrate into R2 and S3 providers
4. Add error callbacks
5. Export standalone validator utility

Let me know if you want to proceed! 🚀
