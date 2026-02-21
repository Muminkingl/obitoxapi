/**
 * ObitoX Structured Logger
 * 
 * A lightweight, production-ready logger that:
 * - Supports log levels: error, warn, info, debug
 * - In production: only logs error/warn to console
 * - In development: logs all levels with colors
 * - Includes request ID tracking for tracing
 * - JSON format in production for log aggregation
 */

// Import env config to ensure .env.local is loaded
import '../config/env.js';

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// ANSI color codes for development
const COLORS = {
  error: '\x1b[31m',   // Red
  warn: '\x1b[33m',    // Yellow
  info: '\x1b[36m',    // Cyan
  debug: '\x1b[90m',   // Gray
  reset: '\x1b[0m',
  timestamp: '\x1b[2m' // Dim
};

const EMOJIS = {
  error: '❌',
  warn: '⚠️',
  info: '✅',
  debug: '🔍'
};

// Determine log level from environment
const getLogLevel = () => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
    return LOG_LEVELS[envLevel];
  }
  // Default: debug in development, info in production (errors + warnings + info visible)
  return process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;
};

const currentLevel = getLogLevel();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Format timestamp
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Format log entry for production (JSON)
 */
const formatProduction = (level, message, meta = {}) => {
  const entry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...meta
  };
  return JSON.stringify(entry);
};

/**
 * Format log entry for development (colored, readable)
 */
const formatDevelopment = (level, message, meta = {}) => {
  const timestamp = COLORS.timestamp + new Date().toISOString() + COLORS.reset;
  const color = COLORS[level] || '';
  const emoji = EMOJIS[level] || '';

  let output = `${timestamp} ${color}${emoji} ${message}${COLORS.reset}`;

  // Add metadata if present
  if (Object.keys(meta).length > 0) {
    output += '\n  ' + JSON.stringify(meta, null, 2).split('\n').join('\n  ');
  }

  return output;
};

/**
 * Create a logger instance with optional context
 */
const createLogger = (context = '') => {
  const formatMessage = (level, message, meta = {}) => {
    const fullMessage = context ? `[${context}] ${message}` : message;

    if (isProduction) {
      return formatProduction(level, fullMessage, meta);
    }
    return formatDevelopment(level, fullMessage, meta);
  };

  return {
    error: (message, meta = {}) => {
      if (currentLevel >= LOG_LEVELS.error) {
        console.error(formatMessage('error', message, meta));
      }
    },

    warn: (message, meta = {}) => {
      if (currentLevel >= LOG_LEVELS.warn) {
        console.warn(formatMessage('warn', message, meta));
      }
    },

    info: (message, meta = {}) => {
      if (currentLevel >= LOG_LEVELS.info) {
        console.log(formatMessage('info', message, meta));
      }
    },

    debug: (message, meta = {}) => {
      if (currentLevel >= LOG_LEVELS.debug) {
        console.log(formatMessage('debug', message, meta));
      }
    },

    /**
     * Create a child logger with additional context
     */
    child: (childContext) => {
      const fullContext = context ? `${context}:${childContext}` : childContext;
      return createLogger(fullContext);
    },

    /**
     * Log with request ID for tracing
     */
    request: (requestId, message, meta = {}) => {
      if (currentLevel >= LOG_LEVELS.debug) {
        const metaWithRequest = { ...meta, requestId };
        console.log(formatMessage('debug', message, metaWithRequest));
      }
    }
  };
};

// Default logger instance
const logger = createLogger();

// Export both default logger and factory function
export default logger;
export { createLogger, LOG_LEVELS };

// Convenience exports for direct use
export const error = logger.error;
export const warn = logger.warn;
export const info = logger.info;
export const debug = logger.debug;
export const child = logger.child;
export const request = logger.request;
