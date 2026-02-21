/**
 * Environment Variable Validator
 * 
 * Validates all required environment variables at startup.
 * Provides clear error messages for missing/invalid configuration.
 * 
 * Usage:
 *   import { validateEnv } from './utils/env-validator.js';
 *   validateEnv(); // Call at app startup
 */

import logger from './logger.js';

// Environment variable definitions
const ENV_SCHEMA = {
  // Core Server Configuration
  PORT: {
    required: true,
    type: 'number',
    default: 5500,
    description: 'Server port',
  },
  NODE_ENV: {
    required: true,
    type: 'string',
    enum: ['development', 'production', 'test'],
    default: 'development',
    description: 'Application environment',
  },
  SERVER_URL: {
    required: false,
    type: 'url',
    description: 'Server public URL',
  },

  // Database Configuration (Supabase)
  NEXT_PUBLIC_SUPABASE_URL: {
    required: true,
    type: 'url',
    description: 'Supabase project URL',
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    required: true,
    type: 'string',
    sensitive: true,
    description: 'Supabase anonymous key',
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    required: true,
    type: 'string',
    sensitive: true,
    description: 'Supabase service role key',
  },

  // Supabase Storage Configuration
  SUPABASE_BUCKET: {
    required: false,
    type: 'string',
    default: 'test',
    description: 'Default Supabase storage bucket',
  },
  SUPABASE_PRIVATE_BUCKET: {
    required: false,
    type: 'string',
    default: 'private',
    description: 'Private Supabase storage bucket',
  },

  // JWT Configuration
  JWT_SECRET: {
    required: true,
    type: 'string',
    sensitive: true,
    minLength: 32,
    description: 'JWT signing secret (min 32 chars)',
  },
  JWT_EXPIRES_IN: {
    required: false,
    type: 'string',
    default: '7d',
    description: 'JWT expiration time',
  },

  // Redis Configuration
  REDIS_URL: {
    required: false,
    type: 'url',
    description: 'Redis connection URL',
  },
  UPSTASH_REDIS_URL: {
    required: false,
    type: 'url',
    description: 'Upstash Redis URL',
  },

  // Arcjet (Rate Limiting/Bot Protection)
  ARCJET_KEY: {
    required: false,
    type: 'string',
    sensitive: true,
    description: 'Arcjet API key',
  },
  ARCJET_ENV: {
    required: false,
    type: 'string',
    enum: ['development', 'production'],
    description: 'Arcjet environment',
  },

  // Email Configuration
  EMAIL_PASSWORD: {
    required: false,
    type: 'string',
    sensitive: true,
    description: 'Email service password',
  },

  // Queue Configuration
  QSTASH_TOKEN: {
    required: false,
    type: 'string',
    sensitive: true,
    description: 'QStash token for job queues',
  },
  QSTASH_URL: {
    required: false,
    type: 'url',
    description: 'QStash URL',
  },

  // Webhook Configuration
  WEBHOOK_ENCRYPTION_KEY: {
    required: false,
    type: 'string',
    sensitive: true,
    minLength: 32,
    description: 'Webhook encryption key (min 32 chars)',
  },
  WEBHOOK_MAX_ATTEMPTS: {
    required: false,
    type: 'number',
    default: 3,
    description: 'Max webhook retry attempts',
  },
  WEBHOOK_TIMEOUT: {
    required: false,
    type: 'number',
    default: 15000,
    description: 'Webhook timeout in ms',
  },

  // File Upload Configuration
  MAX_FILE_SIZE: {
    required: false,
    type: 'number',
    default: 52428800, // 50MB
    description: 'Max file size in bytes',
  },
  MAX_FILES_PER_USER: {
    required: false,
    type: 'number',
    default: 1000,
    description: 'Max files per user',
  },

  // Rate Limiting
  RATE_LIMIT_PER_MINUTE: {
    required: false,
    type: 'number',
    default: 60,
    description: 'Rate limit per minute',
  },
  RATE_LIMIT_PER_HOUR: {
    required: false,
    type: 'number',
    default: 1000,
    description: 'Rate limit per hour',
  },

  // CORS Configuration
  CORS_ALLOWED_ORIGINS: {
    required: false,
    type: 'string',
    description: 'Comma-separated list of allowed CORS origins',
  },

  // Logging
  LOG_LEVEL: {
    required: false,
    type: 'string',
    enum: ['debug', 'info', 'warn', 'error'],
    default: 'info',
    description: 'Logging level',
  },
};

/**
 * Validate a single environment variable
 */
function validateVar(name, config, errors, warnings) {
  const value = process.env[name];

  // Check required
  if (config.required && !value) {
    if (config.default !== undefined) {
      process.env[name] = String(config.default);
      warnings.push(`${name} not set, using default: ${config.default}`);
      return;
    }
    errors.push(`${name} is required but not set. ${config.description}`);
    return;
  }

  // Skip further validation if not set and not required
  if (!value) {
    return;
  }

  // Type validation
  switch (config.type) {
    case 'number':
      if (isNaN(Number(value))) {
        errors.push(`${name} must be a number, got: "${value}"`);
      }
      break;

    case 'url':
      try {
        new URL(value);
      } catch {
        errors.push(`${name} must be a valid URL, got: "${value}"`);
      }
      break;

    case 'string':
      // Check min length
      if (config.minLength && value.length < config.minLength) {
        errors.push(`${name} must be at least ${config.minLength} characters, got ${value.length}`);
      }
      break;
  }

  // Enum validation
  if (config.enum && !config.enum.includes(value)) {
    errors.push(`${name} must be one of: ${config.enum.join(', ')}, got: "${value}"`);
  }
}

/**
 * Validate all environment variables
 * @throws {Error} If validation fails in production
 * @returns {Object} Validation result
 */
export function validateEnv() {
  const errors = [];
  const warnings = [];
  const validated = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate each variable
  for (const [name, config] of Object.entries(ENV_SCHEMA)) {
    validateVar(name, config, errors, warnings);

    if (process.env[name]) {
      validated.push(name);
    }
  }

  // Log warnings
  for (const warning of warnings) {
    logger.warn(`[ENV] ${warning}`);
  }

  // Log validated variables (hide sensitive)
  logger.info(`[ENV] Validated ${validated.length} environment variables`);

  // Handle errors
  if (errors.length > 0) {
    const message = `Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;

    if (isProduction) {
      // In production, throw error to prevent startup
      logger.error(message);
      throw new Error(message);
    } else {
      // In development, log warning but continue
      logger.warn(message);
      logger.warn('[ENV] Continuing in development mode with missing variables');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validatedCount: validated.length,
  };
}

/**
 * Get environment variable with type coercion
 */
export function getEnv(name, defaultValue = undefined) {
  const config = ENV_SCHEMA[name];
  const value = process.env[name] ?? defaultValue;

  if (value === undefined) {
    return undefined;
  }

  // Type coercion
  if (config?.type === 'number') {
    return Number(value);
  }

  return value;
}

/**
 * Check if running in production
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment() {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Check if running in test mode
 */
export function isTest() {
  return process.env.NODE_ENV === 'test';
}

export default validateEnv;
