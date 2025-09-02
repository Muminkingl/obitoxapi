# SubDub Upload API

Upload files in **3-7 lines of code** with zero bandwidth costs! 🚀

## Quick Start

```bash
npm install @subdub/upload
```

```javascript
import SubDub from '@subdub/upload';

const subdub = new SubDub({
  apiKey: 'ox_your_api_key_here'
});

// Upload a file in 3 lines!
const fileUrl = await subdub.uploadFile(file, {
  vercelToken: 'vercel_blob_rw_your_token_here'
});

console.log('File uploaded:', fileUrl);
```

## Features

- ✅ **3-7 lines of code** - No complex AWS SDK setup
- ✅ **Zero bandwidth costs** - Files never touch your servers
- ✅ **Multiple providers** - Vercel Blob, AWS S3 (coming soon)
- ✅ **TypeScript support** - Full type safety
- ✅ **Usage tracking** - Built-in analytics for billing
- ✅ **Simple pricing** - $4/month for unlimited uploads

## Documentation

- 📖 [SDK Documentation](README-SDK.md)
- 🔧 [API Reference](README-API.md)
- 🚀 [Quick Examples](API-EXAMPLES.md)

## Development

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `env-example.txt`)
4. Run development server: `npm run dev`

### Build SDK

```bash
npm run build
```

### Deploy

```bash
./deploy.sh
```

## API Endpoints

### Authentication
- `GET /api/v1/apikeys/validate` - Validate API key
- `POST /api/v1/apikeys/validate` - Validate API key (POST)

### Upload
- `POST /api/v1/upload/signed-url` - Generate upload URL
- `POST /api/v1/upload/vercel-upload` - Server-side upload
- `POST /api/v1/upload/vercel-direct-url` - Direct upload URL

### Analytics
- `POST /api/v1/analytics/track` - Track upload events

## Database Schema

See `supabase-setup.sql` for the complete database schema including:
- API keys management
- Upload logs and analytics
- Subscription tiers and billing
- Storage provider configurations

## License

MIT License - see [LICENSE](LICENSE) for details.