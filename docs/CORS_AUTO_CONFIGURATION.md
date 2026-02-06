# CORS Auto-Configuration Guide

ObitoX provides automatic CORS configuration for storage providers, eliminating the #1 developer pain point: CORS errors on direct uploads.

---

## Overview

**Problem:** Direct uploads to S3/R2 buckets fail with CORS errors because browsers block cross-origin requests by default.

**Solution:** ObitoX automatically configures CORS on your storage bucket using credentials you provide.

---

## Quick Start

### 1. Configure CORS on Your Bucket

```bash
curl -X POST https://api.obitox.io/api/v1/upload/s3/cors/setup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ox_your_api_key" \
  -d '{
    "s3AccessKey": "AKIAIOSFODNN7EXAMPLE",
    "s3SecretKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "s3Bucket": "my-uploads-bucket",
    "s3Region": "us-east-1",
    "allowedOrigins": ["https://myapp.com"]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "CORS configured for bucket \"my-uploads-bucket\"",
  "configuration": {
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["https://myapp.com"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }]
  }
}
```

### 2. Verify the Configuration

```bash
curl -X POST https://api.obitox.io/api/v1/upload/s3/cors/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ox_your_api_key" \
  -d '{
    "s3AccessKey": "AKIAIOSFODNN7EXAMPLE",
    "s3SecretKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "s3Bucket": "my-uploads-bucket",
    "s3Region": "us-east-1"
  }'
```

**Response:**
```json
{
  "configured": true,
  "rules": [...],
  "issues": [],
  "recommendation": "CORS is configured correctly"
}
```

---

## API Reference

### POST /api/v1/upload/s3/cors/setup

Configures CORS on an S3 bucket.

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| s3AccessKey | string | Yes | AWS Access Key ID |
| s3SecretKey | string | Yes | AWS Secret Access Key |
| s3Bucket | string | Yes | S3 bucket name |
| s3Region | string | No | AWS region (default: us-east-1) |
| allowedOrigins | string[] | No | Allowed origins (default: ["*"]) |

**Required IAM Permission:** `s3:PutBucketCors`

---

### POST /api/v1/upload/s3/cors/verify

Verifies CORS configuration on an S3 bucket.

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| s3AccessKey | string | Yes | AWS Access Key ID |
| s3SecretKey | string | Yes | AWS Secret Access Key |
| s3Bucket | string | Yes | S3 bucket name |
| s3Region | string | No | AWS region (default: us-east-1) |

---

## Security Considerations

### Your Credentials, Your Responsibility

- **You provide your AWS credentials** in the API call
- ObitoX uses these credentials **only** to configure CORS on your bucket
- Credentials are **never stored** by ObitoX
- We recommend using **IAM credentials with minimal permissions**:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutBucketCors",
      "s3:GetBucketCors"
    ],
    "Resource": "arn:aws:s3:::your-bucket-name"
  }]
}
```

### Allowed Origins

We strongly recommend **explicit origins** instead of `["*"]`:

```json
"allowedOrigins": [
  "https://yourdomain.com",
  "https://www.yourdomain.com"
]
```

---

## Troubleshooting

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `ACCESS_DENIED` | IAM user lacks `s3:PutBucketCors` | Add permission to IAM policy |
| `NoSuchBucket` | Bucket doesn't exist or wrong name | Verify bucket name |
| `InvalidToken` | Invalid credentials | Check AWS access keys |

### Verification Checklist

1. ✅ IAM user has `s3:PutBucketCors` permission
2. ✅ Bucket exists in the specified region
3. ✅ Credentials are active (not expired)
4. ✅ Allowed origins match your frontend URL

---

## Example: Full Integration

```javascript
// Step 1: Configure CORS (run once during setup)
async function configureCors() {
  const response = await fetch('https://api.obitox.io/api/v1/upload/s3/cors/setup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'ox_your_api_key'
    },
    body: JSON.stringify({
      s3AccessKey: process.env.AWS_ACCESS_KEY_ID,
      s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3Bucket: 'my-bucket',
      s3Region: 'us-east-1',
      allowedOrigins: [window.location.origin]
    })
  });
  
  const result = await response.json();
  if (result.success) {
    console.log('CORS configured successfully!');
  }
}

// Step 2: Use ObitoX SDK for uploads
import { ObitoX } from '@obitox/sdk';

const client = new ObitoX({ apiKey: 'ox_your_api_key' });

// Direct upload now works without CORS errors!
const url = await client.uploadFile(file, {
  provider: 'S3',
  s3Bucket: 'my-bucket',
  s3Region: 'us-east-1'
});
```

---

## Support

- **Issue?** Check the verification endpoint for specific errors
- **Need help?** Contact support with your bucket name and region
