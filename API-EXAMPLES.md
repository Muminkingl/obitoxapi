# File Upload API - Developer Examples

## The Magic: Upload files in 3-7 lines of code! 🚀

### 1. Get Upload URL (3 lines)

```javascript
// Step 1: Get signed upload URL
const response = await fetch('http://localhost:5500/api/v1/upload/signed-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'ox_your_api_key_here'
  },
  body: JSON.stringify({
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    vercelToken: 'vercel_blob_rw_your_token_here'
  })
});

const { uploadUrl, fileUrl, headers } = await response.json();
```

### 2. Upload File (4 lines)

```javascript
// Step 2: Upload directly to Vercel Blob
const uploadResponse = await fetch(uploadUrl, {
  method: 'PUT',
  headers: headers,
  body: file // Your file data
});

// Step 3: Track completion (optional)
await fetch('http://localhost:5500/api/v1/analytics/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': 'ox_your_api_key_here' },
  body: JSON.stringify({ event: 'completed', fileUrl, filename: 'photo.jpg' })
});
```

## Complete Example (7 lines total)

```javascript
// Complete file upload flow
const getUploadUrl = async (file) => {
  const response = await fetch('http://localhost:5500/api/v1/upload/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'ox_your_api_key_here' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, vercelToken: 'vercel_blob_rw_your_token_here' })
  });
  const { uploadUrl, fileUrl, headers } = await response.json();
  
  await fetch(uploadUrl, { method: 'PUT', headers, body: file });
  return fileUrl; // Your file is now live at this URL!
};
```

## API Endpoints

### 1. Authentication
```http
POST /api/v1/apikeys/validate?apiKey=ox_your_key_here
```

### 2. Upload URL Generation
```http
POST /api/v1/upload/signed-url
{
  "filename": "photo.jpg",
  "contentType": "image/jpeg", 
  "vercelToken": "vercel_blob_rw_your_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "uploadUrl": "https://blob.vercel-storage.com/photo_1234567890_abc123.jpg",
  "fileUrl": "https://blob.vercel-storage.com/photo_1234567890_abc123.jpg",
  "filename": "photo_1234567890_abc123.jpg",
  "method": "PUT",
  "headers": {
    "Authorization": "Bearer vercel_blob_rw_your_token_here",
    "Content-Type": "image/jpeg",
    "x-vercel-filename": "photo_1234567890_abc123.jpg"
  }
}
```

### 3. Analytics Tracking
```http
POST /api/v1/analytics/track
{
  "event": "completed",
  "fileUrl": "https://blob.vercel-storage.com/photo_1234567890_abc123.jpg",
  "filename": "photo_1234567890_abc123.jpg",
  "fileSize": 1024000
}
```

## Why This is Amazing

✅ **3-7 lines of code** instead of 50+ lines of AWS SDK complexity  
✅ **Zero bandwidth costs** - files never touch your servers  
✅ **Multiple providers** - Vercel, AWS, Google Cloud (coming soon)  
✅ **Usage tracking** - built-in analytics for billing  
✅ **Simple pricing** - $4/month for unlimited uploads  

## Test Your API

```bash
# Test the main endpoint
curl -X POST http://localhost:5500/api/v1/upload/signed-url \
  -H "Content-Type: application/json" \
  -H "x-api-key: ox_your_api_key_here" \
  -d '{"filename":"test.jpg","contentType":"image/jpeg","vercelToken":"vercel_blob_rw_your_token_here"}'
```

Your file upload API is now ready to save developers hours of storage provider complexity! 🎉
