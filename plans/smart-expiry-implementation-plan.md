# 🚀 Feature #3: Smart Presigned URL Expiry Implementation Plan

## Overview

Calculate optimal presigned URL expiry based on file size + network speed. Prevents URLs from expiring mid-upload while maintaining security.

**Key Problem Solved:**
- Expiry too short → Upload fails mid-transfer
- Expiry too long → Security risk (URLs can be reused)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  SMART EXPIRY FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐  │
│  │   Client     │───▶│  Signed URL     │───▶│  Upload to   │  │
│  │  sends file  │    │  Generation     │    │  S3/R2       │  │
│  │  size +      │    │  with smart     │    │              │  │
│  │  network     │    │  expiry         │    │              │  │
│  └──────────────┘    └─────────────────┘    └──────────────┘  │
│         │                    │                      │          │
│         │  1. fileSize     │                      │          │
│         │  2. networkInfo   │                      │          │
│         │  3. buffer       │                      │          │
│         │     multiplier   │                      │          │
│         │◀─────────────────│                      │          │
│         │  Optimal expiry  │                      │          │
│         │  based on       │                      │          │
│         │  calculation    │                      │          │
│         │                 │                      │          │
│         └───────────────────────────────────────────────▶     │
│                        4. Upload with optimal expiry           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Network Speed Estimates (Conservative)

| Network Type | Speed | Use Case |
|--------------|-------|----------|
| slow-2g | 50 KB/s | Edge networks |
| 2g | 150 KB/s | Slow mobile |
| 3g | 750 KB/s | Standard mobile |
| 4g | 5 MB/s | Fast mobile |
| wifi | 15 MB/s | Home/Office WiFi |
| unknown | 500 KB/s | Conservative default |

---

## Step-by-Step Implementation

### Step 1: Create Smart Expiry Calculator Utility
**File:** `utils/smart-expiry.js`

```javascript
// Network speed estimates (bytes per second)
const NETWORK_SPEEDS = {
    'slow-2g': 50 * 1024,        // 50 KB/s
    '2g': 150 * 1024,            // 150 KB/s
    '3g': 750 * 1024,            // 750 KB/s
    '4g': 5 * 1024 * 1024,       // 5 MB/s
    'wifi': 15 * 1024 * 1024,    // 15 MB/s
    'unknown': 500 * 1024        // 500 KB/s (safe default)
};

/**
 * Calculate optimal presigned URL expiry
 */
export function calculateSmartExpiry(options) {
    const {
        fileSize,
        networkInfo = {},
        bufferMultiplier = 1.5,
        minExpirySeconds = 60,
        maxExpirySeconds = 7 * 24 * 60 * 60  // 7 days
    } = options;

    // Determine network speed
    let speedBytesPerSecond;
    let networkType;

    if (networkInfo.downlink && networkInfo.downlink > 0) {
        // Use actual downlink speed (Mbps → bytes/sec)
        speedBytesPerSecond = (networkInfo.downlink * 1024 * 1024) / 8;
        networkType = networkInfo.effectiveType || 'measured';
    } else if (networkInfo.effectiveType && networkInfo.effectiveType !== 'unknown') {
        networkType = networkInfo.effectiveType;
        speedBytesPerSecond = NETWORK_SPEEDS[networkInfo.effectiveType];
    } else {
        networkType = 'unknown';
        speedBytesPerSecond = NETWORK_SPEEDS.unknown;
    }

    // Calculate estimated upload time
    const estimatedUploadTime = Math.ceil(fileSize / speedBytesPerSecond);

    // Add buffer for network fluctuations
    const bufferTime = Math.ceil(estimatedUploadTime * (bufferMultiplier - 1));
    let expirySeconds = estimatedUploadTime + bufferTime;

    // Apply min/max constraints
    expirySeconds = Math.max(minExpirySeconds, expirySeconds);
    expirySeconds = Math.min(maxExpirySeconds, expirySeconds);

    // Generate reasoning for debugging
    const reasoning = {
        fileSize: formatBytes(fileSize),
        networkType,
        networkSpeed: formatBytes(speedBytesPerSecond) + '/s',
        estimatedUploadTime: formatDuration(estimatedUploadTime),
        bufferTime: formatDuration(bufferTime),
        finalExpiry: formatDuration(expirySeconds),
        originalExpiry: formatDuration(estimatedUploadTime + bufferTime),
        capped: {
            min: estimatedUploadTime + bufferTime < minExpirySeconds,
            max: estimatedUploadTime + bufferTime > maxExpirySeconds
        }
    };

    return {
        expirySeconds,
        estimatedUploadTime,
        networkType,
        bufferTime,
        reasoning
    };
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format duration to human-readable
 */
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}
```

### Step 2: Integrate into R2 Signed URL Controller
**File:** `controllers/providers/r2/r2.signed-url.js`

```javascript
import { calculateSmartExpiry } from '../../../utils/smart-expiry.js';

// In generateR2SignedUrl function:
// After file size validation, before signing

const { networkInfo, bufferMultiplier, minExpirySeconds, maxExpirySeconds } = req.body;

let expiresIn = SIGNED_URL_EXPIRY; // Default

if (networkInfo || bufferMultiplier || minExpirySeconds || maxExpirySeconds) {
    console.log(`[${requestId}] 🧠 Calculating smart expiry...`);
    
    const smartExpiry = calculateSmartExpiry({
        fileSize: fileSize || 0,
        networkInfo: networkInfo || {},
        bufferMultiplier: bufferMultiplier || 1.5,
        minExpirySeconds: minExpirySeconds || 60,
        maxExpirySeconds: maxExpirySeconds || 7 * 24 * 60 * 60
    });
    
    expiresIn = smartExpiry.expirySeconds;
    
    console.log(`[${requestId}] 🧠 Smart expiry:`, smartExpiry.reasoning);
    
    // Include smart expiry info in response
    response.smartExpiry = {
        calculatedExpiry: smartExpiry.expirySeconds,
        estimatedUploadTime: smartExpiry.estimatedUploadTime,
        networkType: smartExpiry.networkType,
        bufferTime: smartExpiry.bufferTime,
        reasoning: smartExpiry.reasoning
    };
}
```

### Step 3: Integrate into S3 Signed URL Controller
**File:** `controllers/providers/s3/s3.signed-url.js`

Similar integration as R2 controller.

### Step 4: Update Response Format

Add smart expiry info to signed URL responses:

```javascript
// In R2/S3 signed-url responses:
return res.status(200).json({
    success: true,
    uploadUrl,
    publicUrl,
    expiresIn,  // Now smart-calculated
    // ... existing fields
    smartExpiry: {
        calculatedExpiry: expirySeconds,
        estimatedUploadTime,
        networkType,
        bufferTime,
        reasoning
    }
});
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `utils/smart-expiry.js` | Smart expiry calculator utility |

### Modified Files
| File | Changes |
|------|---------|
| `controllers/providers/r2/r2.signed-url.js` | Integrate smart expiry |
| `controllers/providers/s3/s3.signed-url.js` | Integrate smart expiry |

---

## API Changes

### Request Body (Optional additions)
```json
{
    "filename": "image.jpg",
    "contentType": "image/jpeg",
    "fileSize": 5242880,
    "networkInfo": {
        "effectiveType": "4g",
        "downlink": 10.5,
        "rtt": 50
    },
    "bufferMultiplier": 1.5,
    "minExpirySeconds": 60,
    "maxExpirySeconds": 86400
}
```

### Response (with smart expiry)
```json
{
    "success": true,
    "uploadUrl": "https://...",
    "expiresIn": 120,
    "smartExpiry": {
        "calculatedExpiry": 120,
        "estimatedUploadTime": 80,
        "networkType": "4g",
        "bufferTime": 40,
        "reasoning": {
            "fileSize": "5.0 MB",
            "networkType": "4g",
            "networkSpeed": "5.0 MB/s",
            "estimatedUploadTime": "1m 20s",
            "bufferTime": "40s",
            "finalExpiry": "2m 0s"
        }
    }
}
```

---

## Example Usage

### Without Smart Expiry (Current Behavior)
```javascript
// Uses default expiry (1 hour)
const result = await fetch('/api/v1/upload/r2/signed-url', {
    method: 'POST',
    body: JSON.stringify({
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        fileSize: 5242880
    })
});
// expiresIn: 3600 (1 hour)
```

### With Smart Expiry
```javascript
// Client sends network info
const result = await fetch('/api/v1/upload/r2/signed-url', {
    method: 'POST',
    body: JSON.stringify({
        filename: 'image.jpg',
        contentType: 'image/jpeg',
        fileSize: 5242880,
        networkInfo: {
            effectiveType: '4g',
            downlink: 10.5
        },
        bufferMultiplier: 1.5
    })
});
// expiresIn: 120 (2 minutes - optimal for 5MB file on 4G)
```

---

## Validation Rules

| Constraint | Default | Description |
|------------|---------|-------------|
| minExpirySeconds | 60 | Minimum expiry (1 minute) |
| maxExpirySeconds | 604800 | Maximum expiry (7 days) |
| bufferMultiplier | 1.5 | 50% buffer for network fluctuations |

---

## Next Steps

1. **Create `utils/smart-expiry.js`** - Smart expiry calculator
2. **Integrate into R2 controller** - Add smart expiry calculation
3. **Integrate into S3 controller** - Add smart expiry calculation
4. **Test the implementation** - Verify expiry calculations
5. **Add SDK support** - Client sends network info

---

## Notes

- Smart expiry is **OPTIONAL** - existing code works without changes
- If no network info provided, uses conservative default (500 KB/s)
- Response includes reasoning for debugging
- Maintains backward compatibility with existing API
