import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve .env.local relative to this file's folder (../.env.local)
config({ path: join(__dirname, '..', '.env.local') });

// Core environment variables
export const {
  PORT, NODE_ENV, SERVER_URL,
  DB_URI,
  JWT_SECRET, JWT_EXPIRES_IN,
  ARCJET_ENV, ARCJET_KEY,
  QSTASH_TOKEN, QSTASH_URL,
  EMAIL_PASSWORD,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  REDIS_URL,
  LOG_LEVEL,
} = process.env;

// Supabase configuration (support both naming conventions)
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;