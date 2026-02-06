# 🔥 File Validation Implementation Plan (Backend Controllers)

## Overview
Implement **server-side file validation** in the controllers using magic bytes detection. This provides:
- Security against type spoofing (can't fake file types)
- Consistent validation across all upload methods
- Reusable validation utilities for all providers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FILE VALIDATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐  │
│  │   Client     │───▶│  Validate       │───▶│  Signed URL  │  │
│  │  Request     │    │  Endpoint       │    │  Generation  │  │
│  └──────────────┘    └─────────────────┘    └──────────────┘  │
│         │                    │                      │          │
│         │  1. Send metadata  │                      │          │
│         │  (filename,       │                      │          │
│         │   contentType,     │                      │          │
│         │   fileSize,        │                      │          │
│         │   first bytes)     │                      │          │
│         │◀───────────────────│                      │          │
│         │  2. Validation     │                      │          │
│         │     result         │                      │          │
│         │                    │                      │          │
│         │                    │  3. Validation rules  │          │
│         │                    │     (allowed types,   │          │
│         │                    │      maxSize, etc)   │          │
│         │                    │                      │          │
│         │                    │              ┌───────▼───────┐   │
│         │                    │              │  MAGIC BYTES │   │
│         │                    │              │  VALIDATION  │   │
│         │                    │              └──────────────┘   │
│         │                    │                      │          │
│         │◀──────────────────────────────────────────│          │
│         │        4. Validation Result               │          │
│         │        (valid/invalid with error)         │          │
│         │                                            │          │
│         └────────────────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Implementation

### Step 1: Create Magic Bytes Detector Utility
**File:** `utils/file-validator.js`

```javascript
// Magic bytes signatures for common file types
const MAGIC_BYTES_MAP = {
    // Images
    'jpeg': { bytes: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg' },
    'png': { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mimeType: 'image/png' },
    'gif': { bytes: [0x47, 0x49, 0x46, 0x38], mimeType: 'image/gif' },
    'webp': { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'image/webp' },
    'bmp': { bytes: [0x42, 0x4D], mimeType: 'image/bmp' },
    'svg': { bytes: [0x3C, 0x73, 0x76, 0x67], mimeType: 'image/svg+xml' },
    
    // Documents
    'pdf': { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' },
    'zip': { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' },
    
    // Videos
    'mp4': { bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4' },
    'webm': { bytes: [0x1A, 0x45, 0xDF, 0xA3], mimeType: 'video/webm' },
    
    // Audio
    'mp3': { bytes: [0x49, 0x44, 0x33], mimeType: 'audio/mpeg' },
    'wav': { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'audio/wav' },
};

// Dangerous extensions
const DANGEROUS_EXTENSIONS = [
    'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'js', 'jar',
    'app', 'deb', 'rpm', 'dmg', 'pkg', 'msi', 'scr', 'com', 'pif'
];

// Export functions
export const detectMimeType = (buffer) => { /* ... */ };
export const validateMagicBytes = (buffer, expectedMimeType) => { /* ... */ };
export const sanitizeFilename = (filename) => { /* ... */ };
```

### Step 2: Enhance Validation Helper
**File:** `controllers/providers/shared/validation.helper.js`

Add server-side validation options:
```javascript
export const validateFileServerSide = (options) => {
    // Accept: filename, contentType, fileSize, validation (object)
    // validation: { maxSizeMB, allowedTypes, blockExecutables, etc }
    // Returns: { valid: true/false, error: {...} }
};
```

### Step 3: Create File Validation Endpoint
**File:** `controllers/validation.controller.js`

```javascript
export const validateFile = async (req, res) => {
    const { filename, contentType, fileSize, validation } = req.body;
    
    // Run server-side validation
    const result = await validateFileServerSide({
        filename, contentType, fileSize, ...validation
    });
    
    return res.json(result);
};
```

### Step 4: Add Validation Route
**File:** `routes/upload.routes.js`

```javascript
import { validateFile } from '../controllers/validation.controller.js';

// Validation endpoint
router.post('/api/v1/upload/validate', validateFile);
```

### Step 5: Integrate Validation into Signed URL Providers
**Files:** 
- `controllers/providers/r2/r2.signed-url.js`
- `controllers/providers/s3/s3.signed-url.js`
- `controllers/providers/supabase/supabase.signed-url.js`
- `controllers/providers/uploadcare/uploadcare.signed-url.js`

Add validation block before signed URL generation:
```javascript
// VALIDATION: Server-side file validation (if validation options provided)
if (req.body.validation) {
    const validationResult = await validateFileServerSide({
        filename,
        contentType,
        fileSize,
        ...req.body.validation
    });
    
    if (!validationResult.valid) {
        return res.status(400).json({
            success: false,
            error: 'VALIDATION_FAILED',
            ...validationResult
        });
    }
}
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `utils/file-validator.js` | Magic bytes detection utility |
| `controllers/validation.controller.js` | File validation controller |
| `routes/validation.routes.js` | Validation route |

### Modified Files
| File | Changes |
|------|---------|
| `controllers/providers/shared/validation.helper.js` | Add server-side validation |
| `routes/upload.routes.js` | Add validation endpoint |
| `controllers/providers/r2/r2.signed-url.js` | Integrate validation |
| `controllers/providers/s3/s3.signed-url.js` | Integrate validation |
| `controllers/providers/supabase/supabase.signed-url.js` | Integrate validation |
| `controllers/providers/uploadcare/uploadcare.signed-url.js` | Integrate validation |

---

## API Endpoints

### POST /api/v1/upload/validate
Validate file before upload.

**Request:**
```json
{
    "filename": "image.jpg",
    "contentType": "image/jpeg",
    "fileSize": 1024000,
    "validation": {
        "maxSizeMB": 10,
        "allowedTypes": ["image/jpeg", "image/png"],
        "blockExecutables": true
    }
}
```

**Response (Valid):**
```json
{
    "success": true,
    "valid": true,
    "detectedMimeType": "image/jpeg",
    "checks": {
        "size": { "passed": true },
        "type": { "passed": true },
        "dangerous": { "passed": true }
    }
}
```

**Response (Invalid):**
```json
{
    "success": true,
    "valid": false,
    "error": "INVALID_MIME_TYPE",
    "message": "File type mismatch. Declared: image/jpeg, Detected: application/octet-stream",
    "detectedMimeType": "application/octet-stream"
}
```

---

## Magic Bytes Detection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   MAGIC BYTES DETECTION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Client sends first 8 bytes of file (optional)              │
│     └─▶ Base64 encoded in request header or body                │
│                                                                 │
│  2. OR Client sends just metadata (filename, contentType)      │
│     └─▶ Server validates declared type against allowed list     │
│                                                                 │
│  3. Server reads magic bytes from buffer                        │
│     └─▶ Compare against MAGIC_BYTES_MAP                          │
│                                                                 │
│  4. Match found → Return detected mime type                    │
│     └─▶ Compare with declared contentType                        │
│                                                                 │
│  5. No match → Return detected type as "unknown"               │
│     └─▶ May be blocked based on validation rules                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Options

| Option | Type | Description |
|--------|------|-------------|
| `maxSizeMB` | number | Maximum file size in MB |
| `minSizeKB` | number | Minimum file size in KB |
| `allowedTypes` | string[] | Allowed MIME types |
| `allowedExtensions` | string[] | Allowed file extensions |
| `blockExecutables` | boolean | Block dangerous extensions |
| `sanitizeFilename` | boolean | Sanitize filename |
| `requireMagicBytesMatch` | boolean | Require declared type matches magic bytes |

---

## Next Steps

1. **Create `utils/file-validator.js`** - Magic bytes detector
2. **Enhance `validation.helper.js`** - Server-side validation function
3. **Create `validation.controller.js`** - Validation endpoint
4. **Add route to `upload.routes.js`** - Register validation endpoint
5. **Integrate into each provider** - Add validation to signed URL generation
6. **Test the implementation** - Verify all validation scenarios

---

## Notes

- Magic bytes validation requires client to send first 8 bytes
- For browser clients, this requires FileReader API
- Alternative: Server validates based on declared type against allowed types
- The validation endpoint is OPTIONAL - upload works without it
- Validation during signed URL generation adds ~1-2ms latency
