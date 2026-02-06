# SDK File Validation Integration Plan

## The Developer Pain Points We're Solving

### 1. **Wasted Bandwidth & Time**
Users select a 50MB video, upload starts, then fails at the end because:
- Wrong file type (uploaded `.exe` instead of `.mp4`)
- File too large (exceeded 10MB limit)
- Corrupted file (can't determine type)

> **Solution**: Validate BEFORE upload starts → reject instantly with helpful message

### 2. **Security Nightmares**
Developers worry about:
- Malicious files disguised with fake extensions (`.jpg.exe`)
- MIME type spoofing attacks
- Path traversal in filenames (`../../../etc/passwd`)

> **Solution**: Magic bytes detection + dangerous extension blocking + filename sanitization

### 3. **Inconsistent UX**
Every developer implements their own file validation:
- Some check extensions only
- Some skip size checks
- Error messages are confusing

> **Solution**: Unified API with sensible defaults + customizable rules + clear errors

---

## Proposed SDK API Design

### Option A: Automatic Validation (Zero Config)

```typescript
// Just works™ - validation happens automatically before upload
const url = await sdk.uploadFile(file, {
  provider: 'R2',
  r2Options: { bucket: 'my-bucket', ...credentials }
});

// If file fails validation, throws ValidationError with details
// ✅ No extra code needed
```

**How it works internally:**
1. SDK reads first 8 bytes (magic bytes) from file
2. SDK sends metadata + magic bytes to ObitoX API
3. API validates → returns signed URL OR validation errors
4. SDK either proceeds with upload OR throws helpful error

---

### Option B: Explicit Validation (Full Control)

```typescript
// Step 1: Validate before upload
const validation = await sdk.validateFile(file, {
  maxSize: 10 * 1024 * 1024,           // 10MB
  allowedTypes: ['image/*', 'video/*'], // Glob patterns
  allowedExtensions: ['.jpg', '.png', '.mp4'],
  blockDangerous: true,                 // Block .exe, .bat, etc.
});

if (!validation.valid) {
  console.error(validation.errors);
  // ['File size 52MB exceeds maximum 10MB']
  // ['File extension .exe is not allowed']
  return;
}

// Step 2: Upload (validation already done, fast path)
const url = await sdk.uploadFile(file, {
  provider: 'R2',
  skipValidation: true, // Already validated
  ...
});
```

---

### Option C: Hybrid (Recommended)

```typescript
const url = await sdk.uploadFile(file, {
  provider: 'R2',
  r2Options: { ... },
  
  // Validation options (optional, has sensible defaults)
  validation: {
    maxSize: 50 * 1024 * 1024,           // Override default (100MB → 50MB)
    allowedTypes: ['image/*'],            // Only images
    allowedExtensions: ['.jpg', '.png', '.gif', '.webp'],
    blockDangerous: true,                 // Default: true
    checkMagicBytes: true,                // Default: true (detect fake types)
  },
  
  // Callbacks for validation events
  onValidationStart: () => setLoading(true),
  onValidationComplete: (result) => {
    if (!result.valid) showErrors(result.errors);
  },
});
```

---

## Validation Options Interface

```typescript
interface FileValidationOptions {
  // Size limits
  maxSize?: number;                      // Max file size in bytes
  minSize?: number;                      // Min file size (reject empty files)
  
  // Type restrictions
  allowedTypes?: string[];               // MIME patterns: ['image/*', 'video/mp4']
  blockedTypes?: string[];               // Block specific: ['application/x-msdownload']
  allowedExtensions?: string[];          // ['.jpg', '.png']
  blockedExtensions?: string[];          // ['.exe', '.bat']
  
  // Security
  blockDangerous?: boolean;              // Block known dangerous extensions (default: true)
  checkMagicBytes?: boolean;             // Detect MIME spoofing (default: true)
  sanitizeFilename?: boolean;            // Clean path traversal, special chars (default: true)
  
  // Behavior
  mode?: 'strict' | 'lenient';           // strict = fail on any issue, lenient = warn only
}
```

---

## Validation Result Interface

```typescript
interface FileValidationResult {
  valid: boolean;                        // Overall pass/fail
  
  // Detailed results
  checks: {
    size: { passed: boolean; reason?: string };
    extension: { passed: boolean; reason?: string };
    mimeType: { passed: boolean; reason?: string };
    magicBytes: { passed: boolean; detectedType?: string };
    filename: { passed: boolean; sanitized?: string };
    dangerous: { passed: boolean; threat?: string };
  };
  
  // Aggregated
  errors: string[];                      // Human-readable errors
  warnings: string[];                    // Non-blocking issues
  
  // File info (useful for UI)
  file: {
    originalName: string;
    sanitizedName: string;
    size: number;
    sizeFormatted: string;               // "5.2 MB"
    extension: string;
    declaredType: string;
    detectedType: string | null;         // From magic bytes
    typeMismatch: boolean;               // Declared ≠ detected
  };
}
```

---

## Implementation Components

### 1. Client-Side Utilities (SDK)
- `readMagicBytes(file)` - Read first 8 bytes
- `detectNetworkInfo()` - For smart expiry
- `formatFileSize(bytes)` - Human readable
- `validateFileLocally(file, options)` - Quick client checks

### 2. API Integration
- Send magic bytes with signed URL request
- Receive validation result in response
- If validation fails, don't return signed URL

### 3. Helper Export
```typescript
// For developers who want standalone validation
import { fileValidator } from '@obitox/sdk';

const result = fileValidator.validate(file, options);
const magicBytes = await fileValidator.readMagicBytes(file);
const isImage = fileValidator.isImageType(file);
```

---

## User-Facing Error Messages

Good error messages are crucial. Examples:

| Issue | Bad Message | Good Message |
|-------|------------|--------------|
| Too large | `SIZE_ERROR` | `File "report.pdf" is 52MB, but maximum allowed is 10MB` |
| Wrong type | `TYPE_MISMATCH` | `Expected image file, but got PDF document` |
| Fake extension | `MAGIC_BYTES_MISMATCH` | `File claims to be JPEG but is actually an executable - upload blocked for security` |
| Dangerous | `BLOCKED_TYPE` | `EXE files cannot be uploaded for security reasons` |

---

## Implementation Priority

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | Auto magic bytes detection | Medium | High |
| 2 | Basic validation in uploadFile | Low | High |
| 3 | Standalone validateFile() method | Medium | Medium |
| 4 | Custom validation rules | Medium | Medium |
| 5 | Validation callbacks | Low | Low |

---

## Questions for You

1. **Default behavior**: Should validation be ON by default, or opt-in?
2. **Blocking vs Warning**: Should type mismatches block upload or just warn?
3. **Custom rules**: Do you want regex patterns for filename validation?
4. **Error format**: Single string errors or structured error objects?
