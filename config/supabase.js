/**
 * config/supabase.js — Lazy-initialized Supabase clients
 * (Same laziness pattern as database/supabase.js — fixes CF Workers init crash)
 */

import { createClient } from '@supabase/supabase-js';

const getUrl = () => process.env?.SUPABASE_URL || process.env?.NEXT_PUBLIC_SUPABASE_URL;
const getSvc = () => process.env?.SUPABASE_SERVICE_ROLE_KEY;
const getAnon = () => process.env?.SUPABASE_ANON_KEY || process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CF_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false } };

function lazyClient(getKey) {
  let _client = null;
  return new Proxy({}, {
    get(_, prop) {
      if (!_client) {
        const url = getUrl();
        const key = getKey();
        if (!url || !key) throw new Error('[Supabase config] Missing SUPABASE_URL or key');
        _client = createClient(url, key, CF_OPTIONS);
      }
      const val = _client[prop];
      return typeof val === 'function' ? val.bind(_client) : val;
    },
    has(_, prop) { return true; },
  });
}

export const supabaseAdmin = lazyClient(getSvc);
export const supabaseClient = lazyClient(getAnon);
export default supabaseAdmin;
