/**
 * database/supabase.js — Lazy-initialized Supabase clients
 *
 * In Cloudflare Workers, env vars (from Wrangler secrets) are NOT available at
 * module evaluation time. They are populated just before the first request.
 *
 * Fix: use Proxy objects that lazily create the real Supabase client on first
 * property access, by which time process.env is fully populated.
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

// ── Env helpers (read at call time, not import time) ────────────────────────────
const getUrl = () => process.env?.SUPABASE_URL || process.env?.NEXT_PUBLIC_SUPABASE_URL;
const getSvc = () => process.env?.SUPABASE_SERVICE_ROLE_KEY;
const getAnon = () => process.env?.SUPABASE_ANON_KEY || process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CF_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false } };

// ── Lazy singleton factory ──────────────────────────────────────────────────────
function lazyClient(getKey, label) {
  let _client = null;
  return new Proxy({}, {
    get(_, prop) {
      if (!_client) {
        const url = getUrl();
        const key = getKey();
        if (!url || !key) {
          throw new Error(`[Supabase] Missing env vars for ${label}: SUPABASE_URL or key is undefined`);
        }
        _client = createClient(url, key, CF_OPTIONS);
        logger.debug(`[Supabase] ${label} client initialized`);
      }
      const val = _client[prop];
      return typeof val === 'function' ? val.bind(_client) : val;
    },
    has(_, prop) { return prop in Object.getPrototypeOf({}); },
  });
}

// ── Exported clients ───────────────────────────────────────────────────────────

/** Service-role client (admin operations — bypasses RLS) */
export const supabaseAdmin = lazyClient(getSvc, 'admin');

/** Anon client (user-facing operations — respects RLS) */
export const supabaseClient = lazyClient(getAnon, 'client');

// ── Connection test (used by app.js on Node.js only) ─────────────────────────
const connectToSupabase = async () => {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('count', { count: 'exact', head: true });
    if (error) {
      logger.error('Error connecting to Supabase:', { message: error.message });
      return false;
    }
    logger.debug('Connected to Supabase successfully');
    return true;
  } catch (error) {
    logger.error('Failed to connect to Supabase:', { message: error.message });
    return false;
  }
};

export default connectToSupabase;