# Test Vercel Blob Upload API

Use the following curl command to test the Vercel Blob upload API endpoint:

```bash
curl -X POST http://localhost:5500/api/v1/upload/vercel-signed-url \
  -H "Content-Type: application/json" \
  -H "x-api-key: ox_your_api_key_here" \
  -d '{
    "filename": "test.jpg",
    "contentType": "image/jpeg",
    "vercelToken": "vercel_blob_rw_xxxxx"
  }'
```

## Expected Success Response:

```json
{
  "success": true,
  "uploadUrl": "https://xyz.public.blob.vercel-storage.com/test-abc123.jpg",
  "downloadUrl": "https://xyz.public.blob.vercel-storage.com/test-abc123.jpg"
}
```

Replace the following values with your own:
- `ox_your_api_key_here`: A valid API key from your Supabase database
- `vercel_blob_rw_xxxxx`: A valid Vercel Blob read-write token

## Notes

- The API key must exist in your Supabase database
- The Vercel token must have read-write permissions
- The server must be running locally on port 5500 (or modify the URL accordingly)
