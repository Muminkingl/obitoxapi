/**
 * Uploadcare File Deletion
 * WITH ENTERPRISE MULTI-LAYER CACHING
 * 
 * OPTIMIZED: Uses only updateRequestMetrics (Redis-backed)
 */

import {
    UPLOADCARE_API_BASE,
    extractUuidFromUrl,
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
 * Delete file from Uploadcare using their REST API
 */
export const deleteUploadcareFile = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;
    let userId;

    try {
        const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
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
        const memCheck = checkMemoryRateLimit(userId, 'delete');
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
        const redisLimit = await checkRedisRateLimit(userId, 'delete');
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

        if (!fileUrl && !uuid) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: 'Either fileUrl or uuid is required'
            });
        }

        let fileUuid = uuid;

        // Extract UUID from URL if not provided
        if (!fileUuid && fileUrl) {
            fileUuid = extractUuidFromUrl(fileUrl);
            if (!fileUuid) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_URL',
                    message: 'Could not extract UUID from URL'
                });
            }
        }

        if (!fileUuid) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_UUID',
                message: 'Could not determine file UUID'
            });
        }

        const operationStart = Date.now();

        // Delete from Uploadcare using REST API
        const delUrl = `${UPLOADCARE_API_BASE}/files/${fileUuid}/storage/`;
        console.log(`[${requestId}] 🗑️ Deleting from Uploadcare: ${fileUuid}`);

        const deleteResponse = await fetch(delUrl, {
            method: 'DELETE',
            headers: getUploadcareHeaders(uploadcarePublicKey, uploadcareSecretKey)
        });

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();

            let errorType = 'DELETE_ERROR';
            let statusCode = 500;

            if (deleteResponse.status === 404) {
                errorType = 'FILE_NOT_FOUND';
                statusCode = 404;
            } else if (deleteResponse.status === 403) {
                errorType = 'DELETE_PERMISSION_DENIED';
                statusCode = 403;
            }

            updateRequestMetrics(apiKeyId, userId, 'uploadcare', false)
                .catch(() => { });

            return res.status(statusCode).json({
                success: false,
                error: errorType,
                message: 'Failed to delete file from Uploadcare',
                details: errorText
            });
        }

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        console.log(`[${requestId}] ✅ File deleted in ${totalTime}ms`);

        // 🚀 SINGLE METRICS CALL (Redis-backed)
        updateRequestMetrics(apiKeyId, userId, 'uploadcare', true)
            .catch(() => { });

        res.status(200).json({
            success: true,
            message: 'File deleted from Uploadcare successfully',
            data: {
                uuid: fileUuid,
                deletedAt: new Date().toISOString(),
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
            message: 'Internal server error during file deletion',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
