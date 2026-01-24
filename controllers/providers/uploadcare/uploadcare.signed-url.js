/**
 * Uploadcare Signed URL Generation
 * WITH ENTERPRISE MULTI-LAYER CACHING
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import {
    UPLOAD_BASE_URL,
    validateUploadcareCredentials
} from './uploadcare.config.js';
import {
    validateFileForUploadcare,
    generateUploadcareFilename
} from './uploadcare.helpers.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * Generate signed upload URL for Uploadcare
 * Uploadcare uses direct multipart upload (not traditional signed URLs)
 */
export const generateUploadcareSignedUrl = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const { filename, contentType, fileSize, uploadcarePublicKey, uploadcareSecretKey } = req.body;
        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'API key is required'
            });
        }

        // Validate Uploadcare credentials
        const credValidation = validateUploadcareCredentials(uploadcarePublicKey, uploadcareSecretKey);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                error: credValidation.error,
                message: credValidation.message
            });
        }

        // LAYER 1: MEMORY GUARD (0-5ms)
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'signed-url');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: 'memory'
            });
        }

        // LAYER 2: REDIS RATE LIMIT (5-50ms)
        const redisStart = Date.now();
        const redisLimit = await checkRedisRateLimit(userId, 'signed-url');
        const redisTime = Date.now() - redisStart;

        if (!redisLimit.allowed) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: redisLimit.layer
            });
        }

        // LAYER 3: QUOTA CHECK
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.used
            });
        }

        // Validate required fields
        if (!filename || !contentType) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'filename and contentType are required'
            });
        }

        // FAST VALIDATION
        const validationStart = Date.now();
        const fileValidation = validateFileForUploadcare(filename, contentType, fileSize);
        if (!fileValidation.isValid) {
            updateRequestMetrics(apiKeyId, userId, 'uploadcare', false)
                .catch(() => { });
            return res.status(400).json({
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'File validation failed',
                details: fileValidation.errors
            });
        }
        const validationTime = Date.now() - validationStart;

        // GENERATE UPLOAD URL
        const operationStart = Date.now();
        const uniqueFilename = generateUploadcareFilename(filename, apiKeyId);
        const uploadUrl = UPLOAD_BASE_URL;
        const tempUuid = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'uploadcare', true, { fileSize: fileSize || 0 })
            .catch(() => { });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms`);

        // Success response
        res.status(200).json({
            success: true,
            message: 'Uploadcare upload URL generated successfully',
            data: {
                uploadUrl: uploadUrl,
                fileUrl: '',
                filename: uniqueFilename,
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                formData: {
                    UPLOADCARE_PUB_KEY: uploadcarePublicKey,
                    UPLOADCARE_STORE: 'auto',
                    file: '[FILE_DATA]'
                },
                uuid: tempUuid,
                provider: 'uploadcare'
            },
            upload: {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    redisCheck: `${redisTime}ms`,
                    validation: `${validationTime}ms`,
                    operation: `${operationTime}ms`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, req.userId || apiKeyId, 'uploadcare', false)
                .catch(() => { });
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during signed URL generation',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
