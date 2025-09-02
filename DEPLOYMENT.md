# 🚀 SubDub Deployment Guide

## Prerequisites

1. **Vercel Account** - [Sign up here](https://vercel.com)
2. **Supabase Project** - [Create here](https://supabase.com)
3. **Vercel CLI** - `npm i -g vercel`

## Step 1: Deploy API to Vercel

### 1.1 Set Environment Variables

Create a `.env.local` file with your production values:

```bash
# Server configuration
PORT=5500
NODE_ENV=production
SERVER_URL="https://api.subdub.com"

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Arcjet (optional)
ARCJET_KEY=your_arcjet_key_here
ARCJET_ENV="production"

# Email Service (optional)
EMAIL_PASSWORD=your_email_password_here
```

### 1.2 Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy
vercel --prod

# Or use the deployment script
./deploy.sh
```

### 1.3 Set Production Environment Variables

In your Vercel dashboard:
1. Go to your project settings
2. Add all environment variables from `.env.local`
3. Redeploy if needed

## Step 2: Build and Publish SDK

### 2.1 Build the SDK

```bash
npm run build
```

This creates:
- `dist/index.js` (CommonJS)
- `dist/index.esm.js` (ES Modules)
- `dist/index.d.ts` (TypeScript definitions)

### 2.2 Publish to NPM

```bash
# Login to NPM
npm login

# Publish the package
npm publish

# For scoped packages (@subdub/upload)
npm publish --access public
```

## Step 3: Set Up Domain (Optional)

### 3.1 Custom Domain

1. In Vercel dashboard, go to Domains
2. Add your custom domain (e.g., `api.subdub.com`)
3. Update DNS records as instructed

### 3.2 Update SDK Base URL

Update `src/client.ts`:
```typescript
this.baseUrl = config.baseUrl || 'https://api.subdub.com';
```

## Step 4: Database Setup

### 4.1 Run Supabase Migration

1. Go to your Supabase SQL editor
2. Run the contents of `supabase-setup.sql`
3. Verify tables are created

### 4.2 Insert Initial Data

```sql
-- Insert subscription tiers
INSERT INTO public.subscription_tiers (name, monthly_price, yearly_price, upload_limit, custom_domain, priority_support)
VALUES 
  ('Free', 0, 0, 100000000, false, false),
  ('Pro', 400, 4000, 10000000000, true, false),
  ('Enterprise', 1000, 10000, 100000000000, true, true)
ON CONFLICT (name) DO NOTHING;
```

## Step 5: Testing

### 5.1 Test API Endpoints

```bash
# Test API key validation
curl -X GET "https://api.subdub.com/api/v1/apikeys/validate?apiKey=ox_test_key"

# Test upload endpoint
curl -X POST "https://api.subdub.com/api/v1/upload/signed-url" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ox_test_key" \
  -d '{"filename":"test.jpg","contentType":"image/jpeg","vercelToken":"vercel_blob_rw_test_token"}'
```

### 5.2 Test SDK Package

```bash
# Install your published package
npm install @subdub/upload

# Test in a new project
node -e "
const SubDub = require('@subdub/upload');
const subdub = new SubDub({ apiKey: 'ox_test_key' });
subdub.validate().then(console.log);
"
```

## Step 6: Monitoring

### 6.1 Set Up Analytics

- **Vercel Analytics** - Built-in with Vercel
- **Supabase Logs** - Monitor database usage
- **Arcjet** - Rate limiting and bot protection

### 6.2 Health Checks

Create a health check endpoint:

```javascript
// Add to app.js
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```

## Step 7: Documentation

### 7.1 Update Documentation

1. Update `README-SDK.md` with your actual domain
2. Create docs at `docs.subdub.com`
3. Update package.json homepage

### 7.2 Create Landing Page

Create a simple landing page at `subdub.com`:
- Pricing
- Documentation links
- Sign-up flow
- API key generation

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Add CORS middleware to your API
   - Configure allowed origins in Vercel

2. **Environment Variables**
   - Double-check all variables are set in Vercel
   - Use `vercel env ls` to verify

3. **Database Connection**
   - Verify Supabase connection strings
   - Check RLS policies

4. **SDK Build Issues**
   - Ensure TypeScript is installed
   - Check rollup configuration

### Support

- 📧 Email: support@subdub.com
- 💬 Discord: [Join our community](https://discord.gg/subdub)
- 🐛 Issues: [GitHub Issues](https://github.com/subdub/upload/issues)

## Next Steps

1. **Marketing** - Create content about your API
2. **Community** - Build developer community
3. **Features** - Add AWS S3, Google Cloud support
4. **Analytics** - Build dashboard for users
5. **Billing** - Implement Stripe integration 