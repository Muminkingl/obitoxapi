/**
 * ObitoX CORS Middleware - PRODUCTION READY
 * 
 * Comprehensive CORS configuration with:
 * - Dynamic origin validation
 * - Environment-based settings
 * - Security-focused defaults
 * - S3 bucket CORS configuration support (Option A)
 * - Integration with existing middleware stack
 * 
 * Option A: Backend Auto-Configuration
 * Developers configure CORS on their S3 buckets via API.
 * No database whitelist - developers provide their own credentials.
 */

import { NODE_ENV } from '../config/env.js';


// ============================================================================
// Environment-Specific CORS Configuration
// ============================================================================

const CORS_CONFIG = {
    development: {
        allowedOrigins: [
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
    },
    staging: {
        allowedOrigins: [
            'https://staging.obitox.io',
            'https://staging.myapp.com',
            'https://*.vercel.app',
            'https://*.netlify.app',
            'https://*.fly.dev',
        ],
        allowWildcard: true,
        credentials: true,
        maxAge: 3600,
    },
    production: {
        allowedOrigins: [
            'https://obitox.io',
            'https://www.obitox.io',
            'https://dashboard.obitox.io',
            'https://docs.obitox.io',
            'https://app.obitox.io',
        ],
        allowWildcard: false,
        credentials: true,
        maxAge: 86400,
    }
};

// ============================================================================
// HTTP Methods and Headers
// ============================================================================

export const ALLOWED_METHODS = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS',
];

export const ALLOWED_HEADERS = [
    'Authorization',
    'Content-Type',
    'X-API-Key',
    'X-Signature',
    'X-Timestamp',
    'X-Request-ID',
    'X-Client-Version',
    'X-Client-Platform',
    'Accept',
    'Accept-Encoding',
    'Accept-Language',
    'Cache-Control',
    'Origin',
    'Referer',
    'User-Agent',
    'X-Forwarded-For',
    'X-Real-IP',
];

/**
 * Exposed headers including S3-critical ones
 * ETag and Content-Length are CRITICAL for S3 multipart uploads
 */
export const EXPOSED_HEADERS = [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Response-Time',
    'X-Cache-Status',
    'ETag',              // CRITICAL for S3 multipart uploads!
    'Content-Length',    // CRITICAL for progress tracking!
    'Content-Type',      // Needed for file type detection
    'x-amz-request-id', // S3 request tracking
    'x-amz-id-2',       // S3 debugging
];

// ============================================================================
// Suspicious Pattern Detection
// ============================================================================

const SUSPICIOUS_PATTERNS = [
    /\.(xyz|top|gq|ml|cf|tk|ga|info)$/i,  // Suspicious TLDs
    /localhost/i,                           // Localhost in production
    /127\.0\.0\.1/i,                        // Loopback IP
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,  // Any IP address
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current CORS configuration based on environment
 */
function getCorsConfig() {
    const env = NODE_ENV || 'development';
    const customOrigins = process.env.CORS_ALLOWED_ORIGINS;

    if (customOrigins) {
        return {
            ...CORS_CONFIG[env] || CORS_CONFIG.development,
            allowedOrigins: customOrigins.split(',').map(o => o.trim()),
        };
    }

    return CORS_CONFIG[env] || CORS_CONFIG.development;
}

/**
 * Check if origin is in global whitelist
 */
function isOriginInGlobalList(origin, config) {
    if (!origin) return false;

    if (config.allowedOrigins.includes(origin)) {
        return true;
    }

    if (config.allowWildcard) {
        const patterns = config.allowedOrigins.filter(o => o.includes('*'));
        for (const pattern of patterns) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(origin)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if origin passes security validation
 */
function isOriginSecure(origin) {
    if (!origin) return true; // Allow non-origin requests

    for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(origin)) {
            return false;
        }
    }

    return true;
}

/**
 * Log rejected CORS requests for security monitoring
 */
function logRejectedRequest(req, reason) {
    const logData = {
        timestamp: new Date().toISOString(),
        method: req.method || 'CORS',
        path: req.path || '',
        ip: req.ip || req.connection?.remoteAddress || '',
        origin: req.headers?.origin || 'none',
        userAgent: req.headers?.['user-agent'] || 'unknown',
        reason,
    };

    console.warn('[CORS REJECTED]', JSON.stringify(logData));
}

// ============================================================================
// Main CORS Options Factory
// ============================================================================

/**
 * Create CORS options for Express
 * Option A: Backend Auto-Configuration
 */
export function getCorsOptions() {
    const config = getCorsConfig();

    return {
        /**
         * Async origin validation
         */
        origin: async function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, server-to-server)
            if (!origin) {
                return callback(null, true);
            }

            // 1. Check security patterns first (ONLY in production)
            // In development, allow localhost and other dev origins
            if (NODE_ENV === 'production' && !isOriginSecure(origin)) {
                logRejectedRequest(
                    { method: 'CORS', path: '', ip: '', headers: { origin } },
                    'suspicious_origin_pattern'
                );
                return callback(new Error('Origin rejected for security reasons'));
            }

            // 2. Check global whitelist
            if (isOriginInGlobalList(origin, config)) {
                return callback(null, true);
            }

            // 3. Option A: Allow any origin that developer explicitly configures
            // Developers configure CORS on their S3 bucket via /s3/cors/setup
            // So we trust origins they specify in their bucket CORS config

            // 4. Reject other origins
            logRejectedRequest(
                { method: 'CORS', path: '', ip: '', headers: { origin } },
                'origin_not_allowed'
            );
            callback(new Error('Not allowed by CORS'));
        },

        credentials: config.credentials,
        methods: ALLOWED_METHODS,
        allowedHeaders: ALLOWED_HEADERS,
        exposedHeaders: EXPOSED_HEADERS,
        maxAge: config.maxAge,
        preflightContinue: false,
        optionsSuccessStatus: 204,
    };
}

// ============================================================================
// Route-Specific CORS Configuration
// ============================================================================

/**
 * Create route-specific CORS configuration
 */
export function createRouteCorsOptions(routeConfig = {}) {
    const globalConfig = getCorsConfig();

    return {
        origin: async function (origin, callback) {
            if (!origin) {
                return callback(null, true);
            }

            const allowedOrigins = routeConfig.origins || globalConfig.allowedOrigins;
            const allowWildcard = routeConfig.allowWildcard ?? globalConfig.allowWildcard;

            // Check origin
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Wildcard check
            if (allowWildcard) {
                const patterns = allowedOrigins.filter(o => o.includes('*'));
                for (const pattern of patterns) {
                    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                    if (regex.test(origin)) {
                        return callback(null, true);
                    }
                }
            }

            // Option A: Trust developer's bucket CORS configuration

            logRejectedRequest(
                { method: 'CORS', path: '', ip: '', headers: { origin } },
                'origin_not_allowed'
            );
            callback(new Error('Not allowed by CORS'));
        },

        credentials: routeConfig.credentials ?? globalConfig.credentials,
        methods: routeConfig.methods || ALLOWED_METHODS,
        allowedHeaders: routeConfig.allowedHeaders || ALLOWED_HEADERS,
        exposedHeaders: routeConfig.exposedHeaders || EXPOSED_HEADERS,
        maxAge: routeConfig.maxAge ?? globalConfig.maxAge,
        preflightContinue: false,
        optionsSuccessStatus: 204,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * CORS middleware with Vary header support for better caching
 */
export function corsWithVaryHeaders() {
    return (req, res, next) => {
        // Apply Vary header for OPTIONS requests
        if (req.method === 'OPTIONS') {
            res.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
        }
        next();
    };
}

/**
 * Check if request is a preflight OPTIONS request
 */
export function isPreflightRequest(req) {
    return req.method === 'OPTIONS' &&
        req.headers['access-control-request-method'];
}

/**
 * Validate preflight headers
 */
export function validatePreflightHeaders(req) {
    const requestedMethod = req.headers['access-control-request-method'];
    const requestedHeaders = req.headers['access-control-request-headers'];

    const errors = [];

    if (requestedMethod && !ALLOWED_METHODS.includes(requestedMethod)) {
        errors.push(`Method ${requestedMethod} not allowed`);
    }

    if (requestedHeaders) {
        const headers = requestedHeaders.split(',').map(h => h.trim().toLowerCase());
        const allowedLower = ALLOWED_HEADERS.map(h => h.toLowerCase());

        for (const header of headers) {
            if (!allowedLower.includes(header)) {
                errors.push(`Header ${header} not allowed`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        method: requestedMethod,
        headers: requestedHeaders?.split(',').map(h => h.trim()),
    };
}

// ============================================================================
// S3 Bucket CORS Configuration (Option A)
// ============================================================================

import {
    PutBucketCorsCommand,
    GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getS3Client } from '../controllers/providers/s3/s3.config.js';

/**
 * Optimal CORS configuration for S3 file uploads
 * This is the CORS configuration that solves developer pain!
 */
export function getOptimalS3CorsConfig(allowedOrigins = ['*']) {
    return {
        CORSRules: [{
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: allowedOrigins,
            // CRITICAL: These headers fix 90% of S3 CORS issues
            ExposeHeaders: [
                'ETag',
                'x-amz-meta-filename',
                'x-amz-meta-uploadedat',
                'x-amz-version-id',
                'x-amz-delete-marker',
                'Content-Length',
                'Content-Type',
            ],
            MaxAgeSeconds: 3600,
        }]
    };
}

/**
 * Configure CORS on an S3 bucket
 */
export async function configureBucketCORS(s3AccessKey, s3SecretKey, s3Bucket, s3Region, allowedOrigins) {
    const s3 = getS3Client(s3AccessKey, s3SecretKey, s3Region);

    const corsConfig = getOptimalS3CorsConfig(allowedOrigins);

    await s3.send(new PutBucketCorsCommand({
        Bucket: s3Bucket,
        CORSConfiguration: corsConfig,
    }));

    return corsConfig;
}

/**
 * Get current CORS configuration for a bucket
 */
export async function getBucketCORS(s3AccessKey, s3SecretKey, s3Bucket, s3Region) {
    const s3 = getS3Client(s3AccessKey, s3SecretKey, s3Region);

    try {
        const result = await s3.send(new GetBucketCorsCommand({ Bucket: s3Bucket }));
        return result.CORSRules || [];
    } catch (error) {
        if (error.name === 'NoSuchCORSConfiguration') {
            return null;
        }
        throw error;
    }
}

/**
 * Controller for S3 CORS setup endpoint
 */
export const setupS3BucketCors = async (req, res) => {
    try {
        const {
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region = 'us-east-1',
            allowedOrigins
        } = req.body;

        if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_CREDENTIALS',
                message: 's3AccessKey, s3SecretKey, and s3Bucket are required'
            });
        }

        const config = await configureBucketCORS(
            s3AccessKey,
            s3SecretKey,
            s3Bucket,
            s3Region,
            allowedOrigins || ['*']
        );

        res.json({
            success: true,
            message: `CORS configured for bucket "${s3Bucket}"`,
            configuration: config
        });

    } catch (error) {
        console.error('[S3 CORS] Configuration failed:', error);

        if (error.name === 'AccessDenied') {
            return res.status(403).json({
                success: false,
                error: 'ACCESS_DENIED',
                message: 'IAM user needs s3:PutBucketCors permission'
            });
        }

        res.status(500).json({
            success: false,
            error: 'CORS_CONFIGURATION_FAILED',
            message: error.message
        });
    }
};

/**
 * Controller for S3 CORS verification
 */
export const verifyS3BucketCors = async (req, res) => {
    try {
        const { s3AccessKey, s3SecretKey, s3Bucket, s3Region = 'us-east-1' } = req.body;

        const currentConfig = await getBucketCORS(s3AccessKey, s3SecretKey, s3Bucket, s3Region);

        if (!currentConfig) {
            return res.json({
                configured: false,
                message: 'No CORS configuration found'
            });
        }

        // Check for common issues
        const issues = [];
        currentConfig.forEach((rule, i) => {
            if (!rule.AllowedMethods?.includes('PUT')) {
                issues.push(`Rule ${i + 1}: PUT method not allowed (required for uploads)`);
            }
            if (!rule.ExposeHeaders?.includes('ETag')) {
                issues.push(`Rule ${i + 1}: ETag not exposed (required for multipart uploads)`);
            }
        });

        res.json({
            configured: true,
            rules: currentConfig,
            issues,
            recommendation: issues.length > 0
                ? 'Run POST /api/v1/upload/s3/cors/setup to fix automatically'
                : 'CORS is configured correctly'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'CORS_VERIFICATION_FAILED',
            message: error.message
        });
    }
};

// ============================================================================
// R2 Bucket CORS Configuration (S3-Compatible API)
// R2 uses the same S3 API format for CORS configuration
// ============================================================================

import { S3Client } from '@aws-sdk/client-s3';

/**
 * Get R2 client with proper endpoint configuration
 * R2 endpoint format: https://<accountId>.r2.cloudflarestorage.com
 */
function getR2Client(r2AccessKey, r2SecretKey, r2AccountId) {
    const endpoint = r2AccountId 
        ? `https://${r2AccountId}.r2.cloudflarestorage.com`
        : null;

    const config = {
        region: 'auto',
        credentials: {
            accessKeyId: r2AccessKey,
            secretAccessKey: r2SecretKey,
        },
        maxAttempts: 3,
        requestHandler: {
            connectionTimeout: 5000,
            socketTimeout: 5000,
        },
    };

    if (endpoint) {
        config.endpoint = endpoint;
        config.forcePathStyle = true; // R2 requires path-style
    }

    return new S3Client(config);
}

/**
 * Optimal CORS configuration for R2 file uploads
 * R2 is S3-compatible, so same CORS rules apply
 */
export function getOptimalR2CorsConfig(allowedOrigins = ['*']) {
    return {
        CORSRules: [{
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: allowedOrigins,
            // CRITICAL: These headers fix 90% of R2 CORS issues
            ExposeHeaders: [
                'ETag',
                'x-amz-meta-filename',
                'x-amz-meta-uploadedat',
                'x-amz-version-id',
                'x-amz-delete-marker',
                'Content-Length',
                'Content-Type',
            ],
            MaxAgeSeconds: 3600,
        }]
    };
}

/**
 * Configure CORS on an R2 bucket
 * R2 uses the same S3 API (PutBucketCors)
 */
export async function configureR2BucketCORS(r2AccessKey, r2SecretKey, r2Bucket, r2AccountId, allowedOrigins) {
    const r2 = getR2Client(r2AccessKey, r2SecretKey, r2AccountId);

    const corsConfig = getOptimalR2CorsConfig(allowedOrigins);

    await r2.send(new PutBucketCorsCommand({
        Bucket: r2Bucket,
        CORSConfiguration: corsConfig,
    }));

    return corsConfig;
}

/**
 * Get current CORS configuration for an R2 bucket
 */
export async function getR2BucketCORS(r2AccessKey, r2SecretKey, r2Bucket, r2AccountId) {
    const r2 = getR2Client(r2AccessKey, r2SecretKey, r2AccountId);

    try {
        const result = await r2.send(new GetBucketCorsCommand({ Bucket: r2Bucket }));
        return result.CORSRules || [];
    } catch (error) {
        if (error.name === 'NoSuchCORSConfiguration') {
            return null;
        }
        throw error;
    }
}

/**
 * Controller for R2 CORS setup endpoint
 */
export const setupR2BucketCors = async (req, res) => {
    try {
        const {
            r2AccessKey,
            r2SecretKey,
            r2Bucket,
            r2AccountId,
            allowedOrigins
        } = req.body;

        if (!r2AccessKey || !r2SecretKey || !r2Bucket || !r2AccountId) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_CREDENTIALS',
                message: 'r2AccessKey, r2SecretKey, r2Bucket, and r2AccountId are required'
            });
        }

        const config = await configureR2BucketCORS(
            r2AccessKey,
            r2SecretKey,
            r2Bucket,
            r2AccountId,
            allowedOrigins || ['*']
        );

        res.json({
            success: true,
            message: `CORS configured for R2 bucket "${r2Bucket}"`,
            configuration: config
        });

    } catch (error) {
        console.error('[R2 CORS] Configuration failed:', error);

        if (error.name === 'AccessDenied') {
            return res.status(403).json({
                success: false,
                error: 'ACCESS_DENIED',
                message: 'R2 credentials need PutBucketCors permission'
            });
        }

        res.status(500).json({
            success: false,
            error: 'CORS_CONFIGURATION_FAILED',
            message: error.message
        });
    }
};

/**
 * Controller for R2 CORS verification endpoint
 */
export const verifyR2BucketCors = async (req, res) => {
    try {
        const { r2AccessKey, r2SecretKey, r2Bucket, r2AccountId } = req.body;

        if (!r2AccessKey || !r2SecretKey || !r2Bucket || !r2AccountId) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_CREDENTIALS',
                message: 'r2AccessKey, r2SecretKey, r2Bucket, and r2AccountId are required'
            });
        }

        const currentConfig = await getR2BucketCORS(r2AccessKey, r2SecretKey, r2Bucket, r2AccountId);

        if (!currentConfig) {
            return res.json({
                success: true,
                configured: false,
                message: 'No CORS configuration found'
            });
        }

        // Check for common issues
        const issues = [];
        currentConfig.forEach((rule, i) => {
            if (!rule.AllowedMethods?.includes('PUT')) {
                issues.push(`Rule ${i + 1}: PUT method not allowed (required for uploads)`);
            }
            if (!rule.ExposeHeaders?.includes('ETag')) {
                issues.push(`Rule ${i + 1}: ETag not exposed (required for multipart uploads)`);
            }
        });

        res.json({
            success: true,
            configured: true,
            isValid: issues.length === 0,
            corsRules: currentConfig,
            issues,
            recommendation: issues.length > 0
                ? 'Run POST /api/v1/upload/r2/cors/setup to fix automatically'
                : 'CORS is configured correctly'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'CORS_VERIFICATION_FAILED',
            message: error.message
        });
    }
};

// ============================================================================
// Export Default
// ============================================================================

export default {
    getCorsOptions,
    createRouteCorsOptions,
    corsWithVaryHeaders,
    isPreflightRequest,
    validatePreflightHeaders,
    setupS3BucketCors,
    verifyS3BucketCors,
    getOptimalS3CorsConfig,
    configureBucketCORS,
    getBucketCORS,
    // R2 CORS Configuration (S3-compatible API)
    setupR2BucketCors,
    verifyR2BucketCors,
    getOptimalR2CorsConfig,
    configureR2BucketCORS,
    getR2BucketCORS,
};
