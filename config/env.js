import { config } from 'dotenv';

config({ path: '.env.local' });

export const {
  PORT, NODE_ENV, SERVER_URL,
  DB_URI,
  JWT_SECRET, JWT_EXPIRES_IN,
  ARCJET_ENV, ARCJET_KEY,
  QSTASH_TOKEN, QSTASH_URL,
  EMAIL_PASSWORD,
  UPSTASH_REDIS_URL,
  REDIS_URL,
} = process.env;