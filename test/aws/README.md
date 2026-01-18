# AWS S3 SDK Tests

Organized test suite for AWS S3 SDK provider.

## Test Files

Each test file focuses on a specific S3 SDK feature:

1. **1-upload.test.js** - Upload operations (signed URLs)
   - Simple upload
   - Upload with storage class
   - Upload with encryption (SSE-S3)
   - Upload with CloudFront
   - Upload with all options

2. **2-download.test.js** - Download operations (signed URLs)
   - Simple download URL
   - Download with expiration
   - Download with CloudFront
   - Download with response headers

3. **3-delete.test.js** - Delete operations
   - Single file delete
   - Non-existent file handling

4. **4-list.test.js** - List operations
   - List all files
   - List with prefix filter
   - List with pagination (maxKeys)

5. **5-metadata.test.js** - Metadata operations
   - Get file metadata
   - Non-existent file handling

6. **6-batch.test.js** - Batch operations
   - Batch delete (multiple files)
   - Mixed files (existing + non-existing)
   - Size limit validation (1000 max)

## Setup

Before running tests, update the credentials in each test file:

```javascript
const S3_ACCESS_KEY = 'AKIA...';  // Your AWS Access Key
const S3_SECRET_KEY = 'wJalr...';  // Your AWS Secret Key
const S3_BUCKET = 'your-bucket-name';
const S3_REGION = 'us-east-1';     // Your AWS region
```

## Running Tests

Run tests individually:

```bash
# Upload test
node test/aws/1-upload.test.js

# Download test
node test/aws/2-download.test.js

# Delete test
node test/aws/3-delete.test.js

# List test
node test/aws/4-list.test.js

# Metadata test
node test/aws/5-metadata.test.js

# Batch operations test
node test/aws/6-batch.test.js
```

Or run all tests sequentially:

```bash
node test/aws/1-upload.test.js && \
node test/aws/2-download.test.js && \
node test/aws/3-delete.test.js && \
node test/aws/4-list.test.js && \
node test/aws/5-metadata.test.js && \
node test/aws/6-batch.test.js
```

## Requirements

- Node.js 14+
- Valid AWS S3 credentials with appropriate permissions
- ObitoX API key and secret
- Built SDK (`npm run build` first)

## Notes

- Tests assume the SDK has been built (`dist/` folder exists)
- Some tests upload files before testing (upload, delete, batch)
- List and metadata tests assume files exist in bucket
- Adjust test file keys and bucket names as needed
