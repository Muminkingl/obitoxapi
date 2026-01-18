# AWS S3 - DELETE & LIST ENDPOINTS IMPLEMENTATION

## 🗑️ Feature 1: DELETE FILE

**Endpoint:** `DELETE /api/v1/upload/s3/delete`

**Purpose:** Delete files from S3 bucket

**Performance:** 50-100ms (1 AWS API call)

---

### **File:** `controllers/providers/s3/s3.delete.js`

```javascript
import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { isValidRegion } from '../../../utils/aws/s3-regions.js';

/**
 * Delete single file from S3
 * 
 * Performance: 50-100ms (1 AWS API call)
 */
export async function deleteS3File(req, res) {
  const requestId = req.requestId;
  const userId = req.user.id;
  
  try {
    const {
      key,           // Required: S3 object key to delete
      s3AccessKey,
      s3SecretKey,
      s3Bucket,
      s3Region
    } = req.body;
    
    // Validate required fields
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_KEY',
        message: 'S3 object key is required',
        hint: 'Provide the key parameter (e.g., "upl123_photo.jpg")'
      });
    }
    
    if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'S3 credentials are required',
        hint: 'Provide s3AccessKey, s3SecretKey, and s3Bucket'
      });
    }
    
    // Validate region
    const region = s3Region || 'us-east-1';
    if (!isValidRegion(region)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REGION',
        message: `Invalid S3 region: ${region}`
      });
    }
    
    // Create S3 client
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey
      }
    });
    
    // Delete object (1 AWS API call, 50-100ms)
    const command = new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: key
    });
    
    const startTime = Date.now();
    const result = await s3Client.send(command);
    const apiTime = Date.now() - startTime;
    
    console.log(`[${requestId}] ✅ S3 delete: ${key} (${apiTime}ms)`);
    
    // Queue analytics (non-blocking)
    queueS3DeleteAnalytics(userId, {
      key,
      bucket: s3Bucket,
      region,
      requestId
    }).catch(console.error);
    
    return res.status(200).json({
      success: true,
      deleted: key,
      deletedAt: new Date().toISOString(),
      provider: 's3',
      region,
      versionId: result.VersionId || null, // null if versioning not enabled
      hint: result.DeleteMarker 
        ? 'File marked as deleted (versioning enabled)'
        : 'File permanently deleted'
    });
    
  } catch (error) {
    console.error(`[${requestId}] S3 delete error:`, error);
    
    // Handle specific S3 errors
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: `File not found: ${req.body.key}`,
        hint: 'Check the key parameter and ensure the file exists'
      });
    }
    
    if (error.name === 'AccessDenied') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'No permission to delete this file',
        hint: 'Check your IAM permissions (need s3:DeleteObject)'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'S3_DELETE_ERROR',
      message: error.message,
      hint: 'Check your S3 credentials and permissions',
      requestId
    });
  }
}

/**
 * Delete multiple files from S3 (batch operation)
 * 
 * Performance: 200-500ms (1 AWS API call for up to 1000 files)
 */
export async function batchDeleteS3Files(req, res) {
  const requestId = req.requestId;
  const userId = req.user.id;
  
  try {
    const {
      keys,          // Required: Array of S3 object keys to delete
      s3AccessKey,
      s3SecretKey,
      s3Bucket,
      s3Region
    } = req.body;
    
    // Validate keys array
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_KEYS',
        message: 'keys must be a non-empty array',
        hint: 'Provide an array of object keys: ["file1.jpg", "file2.png"]'
      });
    }
    
    // Validate batch size (AWS limit: 1000)
    if (keys.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'BATCH_TOO_LARGE',
        message: 'Cannot delete more than 1000 files in one batch',
        hint: `Split your batch into ${Math.ceil(keys.length / 1000)} smaller requests`
      });
    }
    
    if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'S3 credentials are required'
      });
    }
    
    // Validate region
    const region = s3Region || 'us-east-1';
    if (!isValidRegion(region)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REGION',
        message: `Invalid S3 region: ${region}`
      });
    }
    
    // Create S3 client
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey
      }
    });
    
    // Delete objects (1 AWS API call, 200-500ms)
    const command = new DeleteObjectsCommand({
      Bucket: s3Bucket,
      Delete: {
        Objects: keys.map(key => ({ Key: key })),
        Quiet: false // Return list of deleted objects
      }
    });
    
    const startTime = Date.now();
    const result = await s3Client.send(command);
    const apiTime = Date.now() - startTime;
    
    console.log(`[${requestId}] ✅ S3 batch delete: ${keys.length} files (${apiTime}ms)`);
    
    // Queue analytics (non-blocking)
    queueS3BatchDeleteAnalytics(userId, {
      count: keys.length,
      bucket: s3Bucket,
      region,
      requestId
    }).catch(console.error);
    
    return res.status(200).json({
      success: true,
      deleted: result.Deleted.map(obj => obj.Key),
      deletedCount: result.Deleted.length,
      errors: result.Errors || [],
      errorCount: result.Errors?.length || 0,
      deletedAt: new Date().toISOString(),
      provider: 's3',
      region
    });
    
  } catch (error) {
    console.error(`[${requestId}] S3 batch delete error:`, error);
    
    return res.status(500).json({
      success: false,
      error: 'S3_BATCH_DELETE_ERROR',
      message: error.message,
      hint: 'Check your S3 credentials and permissions',
      requestId
    });
  }
}

/**
 * Queue analytics (non-blocking)
 */
async function queueS3DeleteAnalytics(userId, data) {
  console.log(`[ANALYTICS] S3 delete:`, { userId, ...data });
}

async function queueS3BatchDeleteAnalytics(userId, data) {
  console.log(`[ANALYTICS] S3 batch delete:`, { userId, ...data });
}
```

---

## 📋 Feature 2: LIST FILES

**Endpoint:** `POST /api/v1/upload/s3/list`

**Purpose:** List files in S3 bucket

**Performance:** 100-300ms (1 AWS API call)

---

### **File:** `controllers/providers/s3/s3.list.js`

```javascript
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { isValidRegion } from '../../../utils/aws/s3-regions.js';

/**
 * List files in S3 bucket
 * 
 * Performance: 100-300ms (1 AWS API call)
 */
export async function listS3Files(req, res) {
  const requestId = req.requestId;
  const userId = req.user.id;
  
  try {
    const {
      s3AccessKey,
      s3SecretKey,
      s3Bucket,
      s3Region,
      prefix,               // Optional: Filter by prefix (e.g., "uploads/")
      maxKeys = 1000,       // Optional: Max files to return (default: 1000)
      continuationToken     // Optional: For pagination
    } = req.body;
    
    // Validate credentials
    if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'S3 credentials are required',
        hint: 'Provide s3AccessKey, s3SecretKey, and s3Bucket'
      });
    }
    
    // Validate region
    const region = s3Region || 'us-east-1';
    if (!isValidRegion(region)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REGION',
        message: `Invalid S3 region: ${region}`
      });
    }
    
    // Validate maxKeys
    if (maxKeys < 1 || maxKeys > 1000) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MAX_KEYS',
        message: 'maxKeys must be between 1 and 1000',
        hint: 'Adjust your maxKeys parameter'
      });
    }
    
    // Create S3 client
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey
      }
    });
    
    // List objects (1 AWS API call, 100-300ms)
    const commandParams = {
      Bucket: s3Bucket,
      MaxKeys: maxKeys
    };
    
    if (prefix) {
      commandParams.Prefix = prefix;
    }
    
    if (continuationToken) {
      commandParams.ContinuationToken = continuationToken;
    }
    
    const command = new ListObjectsV2Command(commandParams);
    
    const startTime = Date.now();
    const result = await s3Client.send(command);
    const apiTime = Date.now() - startTime;
    
    console.log(`[${requestId}] ✅ S3 list: ${result.KeyCount} files (${apiTime}ms)`);
    
    // Format files array
    const files = (result.Contents || []).map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified.toISOString(),
      etag: obj.ETag,
      storageClass: obj.StorageClass || 'STANDARD',
      owner: obj.Owner?.DisplayName || null
    }));
    
    // Queue analytics (non-blocking)
    queueS3ListAnalytics(userId, {
      bucket: s3Bucket,
      region,
      count: result.KeyCount,
      requestId
    }).catch(console.error);
    
    return res.status(200).json({
      success: true,
      files,
      count: result.KeyCount,
      isTruncated: result.IsTruncated || false,
      nextContinuationToken: result.NextContinuationToken || null,
      prefix: prefix || null,
      maxKeys,
      provider: 's3',
      region,
      hint: result.IsTruncated 
        ? 'More files available. Use nextContinuationToken for pagination.'
        : 'All files returned'
    });
    
  } catch (error) {
    console.error(`[${requestId}] S3 list error:`, error);
    
    // Handle specific S3 errors
    if (error.name === 'NoSuchBucket') {
      return res.status(404).json({
        success: false,
        error: 'BUCKET_NOT_FOUND',
        message: `Bucket not found: ${req.body.s3Bucket}`,
        hint: 'Check your bucket name and region'
      });
    }
    
    if (error.name === 'AccessDenied') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'No permission to list bucket contents',
        hint: 'Check your IAM permissions (need s3:ListBucket)'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'S3_LIST_ERROR',
      message: error.message,
      hint: 'Check your S3 credentials and permissions',
      requestId
    });
  }
}

/**
 * Queue analytics (non-blocking)
 */
async function queueS3ListAnalytics(userId, data) {
  console.log(`[ANALYTICS] S3 list:`, { userId, ...data });
}
```

---

## 📋 Route Configuration

### **File:** `routes/upload.routes.js` (ADD THESE)

```javascript
import { deleteS3File, batchDeleteS3Files } from '../controllers/providers/s3/s3.delete.js';
import { listS3Files } from '../controllers/providers/s3/s3.list.js';

// S3 Delete
router.delete('/upload/s3/delete', deleteS3File);
router.post('/upload/s3/batch-delete', batchDeleteS3Files);

// S3 List
router.post('/upload/s3/list', listS3Files);
```

---

## 🧪 Test Files

### **File:** `test-s3-delete.js`

```javascript
import fetch from 'node-fetch';
import crypto from 'crypto';

const API_KEY = 'ox_your_api_key';
const API_SECRET = 'sk_your_secret';
const BASE_URL = 'http://localhost:5500';

function generateSignature(method, path, timestamp, body, secret) {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const message = `${method.toUpperCase()}|${path}|${timestamp}|${bodyString}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

async function testS3Delete() {
  console.log('\n🧪 Testing S3 Delete...\n');
  
  const method = 'DELETE';
  const path = '/api/v1/upload/s3/delete';
  const timestamp = Date.now();
  
  const body = {
    key: 'upl123_test-photo.jpg',
    s3AccessKey: 'AKIA...',
    s3SecretKey: 'wJalr...',
    s3Bucket: 'my-test-bucket',
    s3Region: 'us-east-1'
  };
  
  const signature = generateSignature(method, path, timestamp, body, API_SECRET);
  
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-API-Secret': API_SECRET,
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function testS3BatchDelete() {
  console.log('\n🧪 Testing S3 Batch Delete...\n');
  
  const method = 'POST';
  const path = '/api/v1/upload/s3/batch-delete';
  const timestamp = Date.now();
  
  const body = {
    keys: [
      'upl123_file1.jpg',
      'upl124_file2.png',
      'upl125_file3.pdf'
    ],
    s3AccessKey: 'AKIA...',
    s3SecretKey: 'wJalr...',
    s3Bucket: 'my-test-bucket',
    s3Region: 'us-east-1'
  };
  
  const signature = generateSignature(method, path, timestamp, body, API_SECRET);
  
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-API-Secret': API_SECRET,
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run tests
testS3Delete();
setTimeout(() => testS3BatchDelete(), 2000);
```

### **File:** `test-s3-list.js`

```javascript
import fetch from 'node-fetch';
import crypto from 'crypto';

const API_KEY = 'ox_your_api_key';
const API_SECRET = 'sk_your_secret';
const BASE_URL = 'http://localhost:5500';

function generateSignature(method, path, timestamp, body, secret) {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const message = `${method.toUpperCase()}|${path}|${timestamp}|${bodyString}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

async function testS3List() {
  console.log('\n🧪 Testing S3 List Files...\n');
  
  const method = 'POST';
  const path = '/api/v1/upload/s3/list';
  const timestamp = Date.now();
  
  const body = {
    s3AccessKey: 'AKIA...',
    s3SecretKey: 'wJalr...',
    s3Bucket: 'my-test-bucket',
    s3Region: 'us-east-1',
    prefix: 'uploads/', // Optional: filter by prefix
    maxKeys: 100
  };
  
  const signature = generateSignature(method, path, timestamp, body, API_SECRET);
  
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-API-Secret': API_SECRET,
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log(`\n✅ Listed ${data.count} files`);
      if (data.files.length > 0) {
        console.log('\nFirst 5 files:');
        data.files.slice(0, 5).forEach(file => {
          console.log(`- ${file.key} (${file.size} bytes, ${file.storageClass})`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testS3List();
```

---

## 📊 Response Examples

### **DELETE Response:**

```json
{
  "success": true,
  "deleted": "upl123_photo.jpg",
  "deletedAt": "2025-01-12T10:30:00.000Z",
  "provider": "s3",
  "region": "us-east-1",
  "versionId": null,
  "hint": "File permanently deleted"
}
```

### **BATCH DELETE Response:**

```json
{
  "success": true,
  "deleted": [
    "upl123_file1.jpg",
    "upl124_file2.png",
    "upl125_file3.pdf"
  ],
  "deletedCount": 3,
  "errors": [],
  "errorCount": 0,
  "deletedAt": "2025-01-12T10:30:00.000Z",
  "provider": "s3",
  "region": "us-east-1"
}
```

### **LIST Response:**

```json
{
  "success": true,
  "files": [
    {
      "key": "uploads/photo1.jpg",
      "size": 1024000,
      "lastModified": "2025-01-12T10:00:00.000Z",
      "etag": "\"abc123...\"",
      "storageClass": "STANDARD",
      "owner": null
    },
    {
      "key": "uploads/photo2.jpg",
      "size": 2048000,
      "lastModified": "2025-01-12T10:15:00.000Z",
      "etag": "\"def456...\"",
      "storageClass": "STANDARD_IA",
      "owner": null
    }
  ],
  "count": 2,
  "isTruncated": false,
  "nextContinuationToken": null,
  "prefix": "uploads/",
  "maxKeys": 1000,
  "provider": "s3",
  "region": "us-east-1",
  "hint": "All files returned"
}
```

---

## ✅ COMPLETE FEATURE SUMMARY

### **3 Critical Endpoints Added:**

1. ✅ **Download** - `POST /api/v1/download/s3/signed-url` (5-10ms)
2. ✅ **Delete** - `DELETE /api/v1/upload/s3/delete` (50-100ms)
3. ✅ **List** - `POST /api/v1/upload/s3/list` (100-300ms)

### **Bonus:**
4. ✅ **Batch Delete** - `POST /api/v1/upload/s3/batch-delete` (200-500ms for up to 1000 files)

---

## 🎯 NOW YOUR S3 INTEGRATION IS FEATURE-COMPLETE!

**You have:**
- ✅ Upload (simple + multipart)
- ✅ Download (presigned URLs)
- ✅ Delete (single + batch)
- ✅ List (with pagination)
- ✅ Multi-region (27 regions)
- ✅ Storage classes (7 classes)
- ✅ Encryption (SSE-S3 + SSE-KMS)
- ✅ CloudFront CDN

**Same as Supabase, but with AWS enterprise features!** 🚀