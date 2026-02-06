/**
 * CORS Configuration Module
 * 
 * Environment-specific CORS settings for ObitoX API.
 * This file centralizes all CORS-related configuration.
 * 
 * Usage:
 *   import corsConfig from './config/cors.js';
 *   app.use(corsConfig.middleware);
 */

import { NODE_ENV } from './env.js';

// ============================================================================
// Environment-Specific CORS Settings
// ============================================================================

const ENV_CONFIGS = {
    /**
     * Development environment
     * - Permissive for localhost
     * - No preflight caching
     */
    development: {
        origins: [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:8080',
        ],
        allowWildcard: true,
        credentials: true,
        maxAge: 0,
        logRejected: false,
    },

    /**
     * Staging environment
     * - Controlled production-like settings
     * - Limited subdomain wildcards
     */
    staging: {
        origins: [
            'https://staging.obitox.io',
            'https://staging.myapp.com',
            'https://*.vercel.app',
            'https://*.netlify.app',
            'https://*.fly.dev',
        ],
        allowWildcard: true,
        credentials: true,
        maxAge: 3600, // 1 hour
        logRejected: true,
    },

    /**
     * Production environment
     * - Strict origin validation
     * - No wildcards
     * - Full logging
     */
    production: {
        origins: [
            'https://obitox.io',
            'https://www.obitox.io',
            'https://dashboard.obitox.io',
            'https://docs.obitox.io',
            'https://app.obitox.io',
        ],
        allowWildcard: false,
        credentials: true,
        maxAge: 86400, // 24 hours
        logRejected: true,
    },
};

// ============================================================================
// API-Specific CORS Settings
// ============================================================================

/**
 * CORS configuration for public API endpoints
 * - More permissive for developer portal
 */
export const publicApiConfig = {
    origins: [
        ...(ENV_CONFIGS[NODE_ENV]?.origins || ENV_CONFIGS.development.origins),
        // Additional public origins
        'https://*.github.io',      // GitHub Pages
        'https://*.codepen.io',     // CodePen
        'https://*.jsfiddle.net',  // JSFiddle
    ],
    credentials: true,
    maxAge: ENV_CONFIGS[NODE_ENV]?.maxAge || 3600,
};

/**
 * CORS configuration for upload endpoints
 * - Stricter origins for security
 * - Supports large file uploads
 */
export const uploadApiConfig = {
    origins: [
        'https://obitox.io',
        'https://www.obitox.io',
        'https://dashboard.obitox.io',
        'https://*.vercel.app',
        'https://*.netlify.app',
        // Partner integrations
        'https://partner.example.com',
    ],
    credentials: true,
    maxAge: 3600,
};

/**
 * CORS configuration for analytics endpoints
 * - Internal dashboard origins
 */
export const analyticsApiConfig = {
    origins: [
        'https://dashboard.obitox.io',
        'https://obitox.io',
        'https://www.obitox.io',
    ],
    credentials: true,
    maxAge: 3600,
};

/**
 * CORS configuration for webhook endpoints
 * - Very strict - only known partner origins
 */
export const webhookApiConfig = {
    origins: [
        // Only specific partner services
        'https://api.stripe.com',
        'https://hooks.slack.com',
        'https://api.sendgrid.com',
        'https://webhook.site',
    ],
    credentials: false, // Webhooks typically don't use credentials
    maxAge: 86400,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get environment-specific config
 */
export function getEnvConfig() {
    return ENV_CONFIGS[NODE_ENV] || ENV_CONFIGS.development;
}

/**
 * Check if origin is allowed for a specific config
 */
export function isOriginAllowed(origin, config) {
    if (!origin) return false;

    if (config.origins.includes(origin)) {
        return true;
    }

    if (config.allowWildcard) {
        return config.origins.some(o => {
            if (o.includes('*')) {
                const regex = new RegExp('^' + o.replace(/\*/g, '.*') + '$');
                return regex.test(origin);
            }
            return false;
        });
    }

    return false;
}

/**
 * Validate origin against production whitelist
 */
export function validateProductionOrigin(origin) {
    const config = ENV_CONFIGS.production;

    if (!origin) {
        return { valid: false, reason: 'no_origin' };
    }

    if (config.origins.includes(origin)) {
        return { valid: true };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
        /\.(xyz|top|gq|ml|cf|tk|ga|info)$/i, // Suspicious TLDs
        /localhost/i,                           // Localhost in production
        /127\.0\.0\.1/i,                      // Loopback IP
        /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP addresses
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(origin)) {
            return { valid: false, reason: 'suspicious_pattern', pattern: pattern.toString() };
        }
    }

    return { valid: false, reason: 'not_whitelisted' };
}

// ============================================================================
// Export Default Configuration
// ============================================================================

export default {
    ENV_CONFIGS,
    publicApiConfig,
    uploadApiConfig,
    analyticsApiConfig,
    webhookApiConfig,
    getEnvConfig,
    isOriginAllowed,
    validateProductionOrigin,
};
