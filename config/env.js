/**
 * config/env.js — Environment Variables
 *
 * Works in both Node.js (loads .env.local from disk via dotenv)
 * and Cloudflare Workers (env vars come from Wrangler secrets — no filesystem).
 *
 * FIX: Use createRequire to load dotenv from an ESM file. The previous
 * `await import('dotenv')` could throw 'require is not defined' in some PM2
 * / Node.js ESM contexts because dotenv's CJS internals call require.
 * createRequire is the Node.js standard API that gives ESM modules access
 * to a CJS require() function safely.
 *
 * Guard: `import.meta` exists in ESM (Node.js) but NOT in CF Workers where
 * env vars come from Wrangler secrets instead.
 */

try {
  // import.meta.url is available in Node.js ESM but NOT in CF Workers
  if (typeof process !== 'undefined' && process.env && import.meta?.url?.startsWith('file:')) {
    // Built-in 'module' package is always available in Node.js
    const { createRequire } = await import('module');
    const _require = createRequire(import.meta.url);
    const dotenv = _require('dotenv');
    // Load .env.local first (Next.js convention), then .env as fallback
    dotenv.config({ path: '.env.local' });
    dotenv.config({ path: '.env' });
  }
} catch {
  // CF Workers / Deno / dotenv not installed — env vars provided externally
}

// ── Core environment variables ─────────────────────────────────────────────────
const env = typeof process !== 'undefined' ? process.env : globalThis;

export const PORT = env.PORT;
export const NODE_ENV = env.NODE_ENV;
export const SERVER_URL = env.SERVER_URL;
export const DB_URI = env.DB_URI;
export const JWT_SECRET = env.JWT_SECRET;
export const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;
export const ARCJET_ENV = env.ARCJET_ENV;
export const ARCJET_KEY = env.ARCJET_KEY;
export const QSTASH_TOKEN = env.QSTASH_TOKEN;
export const QSTASH_URL = env.QSTASH_URL;
export const EMAIL_PASSWORD = env.EMAIL_PASSWORD;
export const UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
export const UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
export const REDIS_URL = env.REDIS_URL;
export const LOG_LEVEL = env.LOG_LEVEL;
export const WEBHOOK_ENCRYPTION_KEY = env.WEBHOOK_ENCRYPTION_KEY;

// Supabase (support both naming conventions)
export const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;