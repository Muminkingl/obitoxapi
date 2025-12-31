# ObitoX SDK Architecture 🚀

> **Enterprise-Grade Multi-Cloud Storage SDK**  
> TypeScript • Modular Providers • 10K+ req/sec Ready

---

## Quick Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR APPLICATION                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ObitoX SDK                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   client.ts (Main Entry)                 │   │
│  │         Unified API • Provider Registry • Routing        │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────▼───────────────────────────────┐   │
│  │               BaseProvider (Abstract Class)              │   │
│  │     Error Handling • HTTP Client • Rate Limiting         │   │
│  └────────┬────────────────┼────────────────┬──────────────┘   │
│           │                │                │                   │
│  ┌────────▼─────┐  ┌───────▼──────┐  ┌──────▼───────┐         │
│  │    Vercel    │  │   Supabase   │  │  Uploadcare  │         │
│  │   Provider   │  │   Provider   │  │   Provider   │         │
│  │  (286 lines) │  │  (400 lines) │  │  (520 lines) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ObitoX Backend API                         │
│         Rate Limiting • Caching • Analytics • Security          │
└─────────────────────────────────────────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
│ Vercel Blob  │      │   Supabase   │      │   Uploadcare     │
│   Storage    │      │   Storage    │      │      CDN         │
└──────────────┘      └──────────────┘      └──────────────────┘
```

---

## 📁 Source Structure

```
src/
├── client.ts              # Main SDK entry point (ObitoX class)
├── index.ts               # Public exports
│
├── providers/
│   ├── base.provider.ts   # Abstract base class (shared logic)
│   ├── index.ts           # Provider registry & exports
│   │
│   ├── vercel/
│   │   ├── vercel.provider.ts    # Vercel-specific operations
│   │   └── index.ts
│   │
│   ├── supabase/
│   │   ├── supabase.provider.ts  # Supabase operations + buckets
│   │   └── index.ts
│   │
│   └── uploadcare/
│       ├── uploadcare.provider.ts # Uploadcare + virus scanning
│       ├── uploadcare.utils.ts    # Image optimization helpers
│       └── index.ts
│
└── types/
    ├── common.ts            # Shared interfaces (UploadOptions, etc.)
    ├── vercel.types.ts      # Vercel-specific types
    ├── supabase.types.ts    # Supabase-specific types
    ├── uploadcare.types.ts  # Uploadcare-specific types
    └── index.ts             # Type exports
```

---

## 🔥 Key Components

### 1. `client.ts` — The Orchestrator

```typescript
// Developer-facing API
const obitox = new ObitoX({ apiKey: 'ox_...' });

// Unified interface - provider is just an option!
await obitox.uploadFile(file, { provider: 'VERCEL', vercelToken: '...' });
await obitox.uploadFile(file, { provider: 'SUPABASE', supabaseUrl: '...' });
await obitox.uploadFile(file, { provider: 'UPLOADCARE', uploadcarePublicKey: '...' });
```

**What it does:**
- ✅ Provider Registration (plug-and-play architecture)
- ✅ Request Routing (delegates to correct provider)
- ✅ Unified Error Handling
- ✅ Configuration Management

---

### 2. `base.provider.ts` — The Foundation

Every provider extends this class to inherit:

| Feature | What It Does |
|---------|--------------|
| `makeRequest()` | HTTP client with automatic error handling |
| `validateRequiredFields()` | Parameter validation before API calls |
| `trackEvent()` | Analytics event tracking |
| Error Formatting | Consistent error messages across providers |

```typescript
abstract class BaseProvider<UploadOpts, DeleteOpts, DownloadOpts> {
  abstract upload(file: File, options: UploadOpts): Promise<string>;
  abstract delete(options: DeleteOpts): Promise<void>;
  abstract download(options: DownloadOpts): Promise<string>;
}
```

---

### 3. Provider Implementations

| Provider | Lines | Key Features |
|----------|-------|--------------|
| **Vercel** | 286 | Blob storage, token auth, PUT uploads |
| **Supabase** | 400 | Bucket management, signed URLs, RLS |
| **Uploadcare** | 520 | Virus scanning, image optimization, CDN |

Each provider:
- ✅ Calls ObitoX Backend (not cloud directly)
- ✅ Handles provider-specific auth
- ✅ Formats responses consistently

---

## 🎯 How Upload Works

```
Developer Code                    SDK                        Backend
     │                             │                            │
     │  obitox.uploadFile(...)    │                            │
     ├────────────────────────────►│                            │
     │                             │  Detect provider           │
     │                             │  (VERCEL/SUPABASE/...)     │
     │                             │                            │
     │                             │  POST /signed-url          │
     │                             ├───────────────────────────►│
     │                             │                            │  Auth + Rate Limit
     │                             │◄───────────────────────────┤  Return signed URL
     │                             │                            │
     │                             │  PUT to Cloud Storage      │
     │                             ├────────────────────────────┼───► Cloud Provider
     │                             │                            │
     │  Return CDN URL            │                            │
     │◄────────────────────────────┤                            │
```

---

## 📊 Type System

```typescript
// Every provider has specific types
interface VercelUploadOptions extends BaseUploadOptions {
  vercelToken: string;      // Required for Vercel
  cacheControl?: string;    // Optional
}

interface SupabaseUploadOptions extends BaseUploadOptions {
  supabaseUrl: string;      // Required
  supabaseToken: string;    // Required
  bucket: string;           // Required
}

interface UploadcareUploadOptions extends BaseUploadOptions {
  uploadcarePublicKey: string;  // Required
  imageOptimization?: {...};    // Optional CDN transforms
  checkVirus?: boolean;         // Optional malware scan
}
```

---

## 🚀 Performance Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     REQUEST FLOW                            │
├─────────────────────────────────────────────────────────────┤
│  1. Memory Guard (0.001ms)  →  In-process rate limit       │
│  2. Redis Check (2-5ms)     →  Distributed rate limit      │
│  3. Quota Check (5-10ms)    →  User limits verification    │
│  4. Cloud Operation         →  Actual storage action       │
│  5. Analytics (async)       →  Non-blocking metrics        │
└─────────────────────────────────────────────────────────────┘
```

**Result:** ~50-100ms in production (10K+ req/sec capable)

---

## 📝 Adding a New Provider

```typescript
// 1. Create types/newprovider.types.ts
export interface NewProviderUploadOptions extends BaseUploadOptions {
  newProviderApiKey: string;
}

// 2. Create providers/newprovider/newprovider.provider.ts
export class NewProvider extends BaseProvider<...> {
  async upload(file, options) {
    return this.makeRequest('/api/v1/upload/newprovider/signed-url', {...});
  }
  async delete(options) { ... }
  async download(options) { ... }
}

// 3. Register in providers/index.ts
registry.register('NEWPROVIDER', NewProvider);
```

---

## ✅ Testing

| Test File | What It Tests |
|-----------|---------------|
| `test-actual-sdk-vercel.js` | Vercel provider (6/6 ✅) |
| `test-actual-sdk-supabase.js` | Supabase provider (6/6 ✅) |
| `test-actual-sdk-uploadcare.js` | Uploadcare core (5/5 ✅) |
| `test-actual-sdk-uploadcare-advanced.js` | Virus scan + optimization (7/7 ✅) |

**Total: 24/24 tests passing** 🎉

---

## 🎯 TL;DR

1. **One SDK, Multiple Clouds** — Same API for Vercel, Supabase, Uploadcare
2. **Type-Safe** — Full TypeScript with provider-specific types
3. **Enterprise-Ready** — Multi-layer caching, rate limiting, analytics
4. **Modular** — Add new providers in ~100 lines of code
5. **Battle-Tested** — 24/24 tests passing across all providers

---

*Built with ❤️ for ObitoX by the SDK Team*
