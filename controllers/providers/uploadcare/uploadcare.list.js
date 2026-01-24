/**
 * Uploadcare File Listing
 * WITH ENTERPRISE MULTI-LAYER CACHING
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import {
    UPLOADCARE_API_BASE,
    validateUploadcareCredentials,
    getUploadcareHeaders
} from './uploadcare.config.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';

// Quota check
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

/**
 * List files from Uploadcare
 */
export const listUploadcareFiles = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;
    let userId;

    try {
        const { uploadcarePublicKey, uploadcareSecretKey, limit = 100, offset = 0 } = req.body;
        apiKeyId = req.apiKeyId;
        userId = req.userId || apiKeyId;

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

        // LAYER 1: Memory guard
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'list');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: 'memory'
            });
        }

        // LAYER 2: Redis rate limit
        const redisStart = Date.now();
        const redisLimit = await checkRedisRateLimit(userId, 'list');
        const redisTime = Date.now() - redisStart;

        if (!redisLimit.allowed) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: redisLimit.layer
            });
        }

        // LAYER 3: Quota check
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(403).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.used
            });
        }

        const operationStart = Date.now();

        // List files from Uploadcare REST API
        const listResponse = await fetch(`${UPLOADCARE_API_BASE}/files/?limit=${limit}&offset=${offset}`, {
            method: 'GET',
            headers: getUploadcareHeaders(uploadcarePublicKey, uploadcareSecretKey)
        });

        if (!listResponse.ok) {
            const errorText = await listResponse.text();

            let errorType = 'LIST_ERROR';
            let statusCode = 500;

            if (listResponse.status === 403) {
                errorType = 'LIST_PERMISSION_DENIED';
                statusCode = 403;
            }

            updateRequestMetrics(apiKeyId, userId, 'uploadcare', false)
                .catch(() => { });

            return res.status(statusCode).json({
                success: false,
                error: errorType,
                message: 'Failed to list files from Uploadcare',
                details: errorText
            });
        }

        const listData = await listResponse.json();

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms (${listData.results?.length || 0} files)`);

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'uploadcare', true)
            .catch(() => { });

        res.status(200).json({
            success: true,
            message: 'Files listed from Uploadcare successfully',
            data: {
                files: listData.results || [],
                total: listData.total || 0,
                next: listData.next || null,
                previous: listData.previous || null,
                limit,
                offset,
                provider: 'uploadcare'
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    redisCheck: `${redisTime}ms`,
                    uploadcareOperation: `${operationTime}ms`
                }
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${requestId}] 💥 Error after ${totalTime}ms:`, error);

        if (apiKeyId) {
            updateRequestMetrics(apiKeyId, userId || apiKeyId, 'uploadcare', false)
                .catch(() => { });
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during file listing',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
