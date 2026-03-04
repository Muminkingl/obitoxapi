/**
 * config/env.js — Environment Variables
 *
 * Works in both Node.js (loads .env.local from disk via dotenv)
 * and Cloudflare Workers (env vars come from Wrangler secrets — no filesystem).
 *
 * The fileURLToPath / dotenv block is skipped in CF Workers automatically
 * because there is no filesystem and import.meta.url is not a file: URL.
 */

// ── Load .env.local on Node.js only (dotenv is a no-op if file doesn't exist) ──
// In CF Workers this block is silently skipped — process.env is populated
// by Wrangler secrets instead.
try {
  if (typeof process !== 'undefined' && process.env) {
    // import() is evaluated at runtime so CF Workers bundler won't crash on this
    const dotenvModule = await import('dotenv');
    const dotenv = dotenvModule.default ?? dotenvModule;
    // Use relative path for simplicity — works when CWD is the project root
    dotenv.config({ path: '.env.local' });
  }
} catch {
  // CF Workers or dotenv not installed — env vars provided by Wrangler secrets
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