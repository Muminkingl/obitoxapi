# ObitoX CORS Implementation Guide

## Overview

This document describes the comprehensive CORS (Cross-Origin Resource Sharing) implementation for the ObitoX API. The implementation provides:

- Environment-based configuration (development, staging, production)
- Dynamic origin validation with security checks
- Integration with existing middleware stack
- Route-specific CORS policies
- Comprehensive security logging

## Files Created

| File | Purpose |
|------|---------|
| `middlewares/cors.middleware.js` | Main CORS middleware with origin validation |
| `config/cors.js` | Environment and API-specific configurations |
| `app.js` | Updated to include CORS middleware |
| `routes/upload.routes.js` | Example of route-specific CORS |

## Quick Start

### 1. Global CORS (Automatic)

CORS is automatically applied globally via `app.js`:

```javascript
import cors from 'cors';
import { getCorsOptions } from './middlewares/cors.middleware.js';

app.use(cors(getCorsOptions()));
```

This applies CORS to all routes with environment-appropriate settings.

### 2. Route-Specific CORS

For fine-grained control, apply CORS to specific routes:

```javascript
import cors from 'cors';
import { createRouteCorsOptions } from '../middlewares/cors.middleware.js';
import { uploadApiConfig } from '../config/cors.js';

const uploadCors = cors(createRouteCorsOptions(uploadApiConfig));

// Apply to specific route
router.post('/upload', uploadCors, uploadController);
```

## Environment Configuration

### Development
```javascript
{
    origins: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
    ],
    allowWildcard: true,
    credentials: true,
    maxAge: 0,
}
```

### Staging
```javascript
{
    origins: [
        'https://staging.obitox.io',
        'https://*.vercel.app',
    ],
    allowWildcard: true,
    credentials: true,
    maxAge: 3600,
}
```

### Production
```javascript
{
    origins: [
        'https://obitox.io',
        'https://www.obitox.io',
        'https://dashboard.obitox.io',
    ],
    allowWildcard: false,
    credentials: true,
    maxAge: 86400,
}
```

## API-Specific Configurations

### Public API (Developer Portal)
```javascript
import { publicApiConfig } from '../config/cors.js';

const publicCors = cors(createRouteCorsOptions(publicApiConfig));
router.use('/docs', publicCors);
```

### Upload API (Stricter Origins)
```javascript
import { uploadApiConfig } from '../config/cors.js';

const uploadCors = cors(createRouteCorsOptions(uploadApiConfig));
router.post('/upload', uploadCors, uploadController);
```

### Analytics API (Dashboard Only)
```javascript
import { analyticsApiConfig } from '../config/cors.js';

const analyticsCors = cors(createRouteCorsOptions(analyticsApiConfig));
router.get('/stats', analyticsCors, statsController);
```

### Webhook API (Partner Services)
```javascript
import { webhookApiConfig } from '../config/cors.js';

const webhookCors = cors(createRouteCorsOptions(webhookApiConfig));
router.post('/webhook', webhookCors, webhookController);
```

## Headers Configuration

### Allowed Request Headers
```javascript
const ALLOWED_HEADERS = [
    'Authorization',
    'Content-Type',
    'X-API-Key',
    'X-Signature',
    'X-Timestamp',
    'X-Request-ID',
    'X-Client-Version',
    'X-Client-Platform',
    'Accept',
    'Origin',
    'User-Agent',
];
```

### Exposed Response Headers
```javascript
const EXPOSED_HEADERS = [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Response-Time',
    'X-Cache-Status',
];
```

## Security Features

### Origin Validation

Origins are validated against a predefined list:

```javascript
function isOriginAllowed(origin, config) {
    // Check exact match
    if (config.allowedOrigins.includes(origin)) {
        return true;
    }
    
    // Wildcard check for subdomains
    if (config.allowWildcard) {
        const patterns = config.allowedOrigins.filter(o => o.includes('*'));
        for (const pattern of patterns) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(origin)) {
                return true;
            }
        }
    }
    
    return false;
}
```

### Suspicious Pattern Detection

Production mode rejects suspicious origins:

```javascript
const suspiciousPatterns = [
    /\.(xyz|top|gq|ml|cf|tk|ga|info)$/i,  // Suspicious TLDs
    /localhost/i,                           // Localhost in production
    /127\.0\.0\.1/i,                        // Loopback IP
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,   // Any IP address
];
```

### Logging

Rejected requests are logged with security context:

```javascript
function logRejectedRequest(req, reason) {
    const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
        origin: req.headers.origin,
        userAgent: req.headers['user-agent'],
        reason,
    };
    console.warn('[CORS REJECTED]', JSON.stringify(logData));
}
```

## Middleware Execution Order

The CORS middleware integrates with your existing security stack:

```
1. express.json()        - Parse JSON body
2. cookieParser()        - Parse cookies
3. cors()                - CORS headers (this implementation)
4. arcjetMiddleware      - Bot protection
5. Rate Limiter          - Request throttling
6. API Key Validation    - Authentication
7. Request Processing    - Controllers
8. Error Handling        - Error middleware
```

## Environment Variables

Override CORS configuration using environment variables:

```bash
# Comma-separated list of allowed origins
CORS_ALLOWED_ORIGINS=https://example.com,https://app.example.com

# Enable wildcard for subdomain matching
CORS_ALLOW_WILDCARD=true

# Preflight cache duration in seconds
CORS_MAX_AGE=86400
```

## Preflight Request Handling

Preflight (OPTIONS) requests are automatically handled:

```
OPTIONS /api/v1/upload → 204 No Content
Access-Control-Allow-Origin: https://obitox.io
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-API-Key, ...
Access-Control-Max-Age: 86400
```

## Troubleshooting

### Common CORS Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `No 'Access-Control-Allow-Origin'` | Origin not in whitelist | Add origin to config |
| `Credentials not supported` | Credentials=true with wildcard | Remove wildcard, use exact origin |
| `Method not allowed` | Request method not in whitelist | Add method to ALLOWED_METHODS |
| `Header not allowed` | Request header not in whitelist | Add header to ALLOWED_HEADERS |

### Debug Mode

Enable CORS debugging in development:

```javascript
// In middlewares/cors.middleware.js
const DEBUG_CORS = process.env.DEBUG_CORS === 'true';

if (DEBUG_CORS && !isOriginAllowed(origin, config)) {
    console.log('[CORS DEBUG] Origin rejected:', origin);
}
```

## Example: Complete Route with CORS

```javascript
import express from 'express';
import cors from 'cors';
import { createRouteCorsOptions } from '../middlewares/cors.middleware.js';
import { uploadApiConfig } from '../config/cors.js';
import { generateS3SignedUrl } from '../controllers/providers/s3/s3.signed-url.js';

const router = express.Router();

// Upload route with specific CORS policy
router.post(
    '/s3/sign',
    cors(createRouteCorsOptions(uploadApiConfig)), // CORS first
    uploadRateLimiter,                              // Then rate limiting
    validateApiKey,                                 // Then authentication
    generateS3SignedUrl                             // Finally controller
);

export default router;
```

## Testing CORS

### Test with curl
```bash
# Preflight request
curl -X OPTIONS \
  -H "Origin: https://obitox.io" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:5500/api/v1/upload/s3/sign

# Actual request
curl -X POST \
  -H "Origin: https://obitox.io" \
  -H "Authorization: Bearer token" \
  http://localhost:5500/api/v1/upload/s3/sign
```

### Test with JavaScript
```javascript
// Test from browser console
fetch('http://localhost:5500/api/v1/upload/s3/sign', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'ox_...',
        'Origin': 'https://obitox.io'
    },
    body: JSON.stringify({ filename: 'test.jpg', contentType: 'image/jpeg' })
})
.then(r => {
    console.log('CORS headers:', r.headers.get('access-control-allow-origin'));
});
```

## Migration from Existing CORS

If you had existing CORS configuration:

**Before:**
```javascript
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
}));
```

**After:**
```javascript
import { getCorsOptions } from './middlewares/cors.middleware.js';

app.use(cors(getCorsOptions()));
```

The new implementation provides:
- ✅ Secure origin validation
- ✅ Environment-appropriate settings
- ✅ Comprehensive logging
- ✅ Route-specific policies
- ✅ Integration with security stack
