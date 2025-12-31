/**
 * Uploadcare File Deletion
 * WITH ENTERPRISE MULTI-LAYER CACHING
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import {
    UPLOADCARE_API_BASE,
    UPLOADCARE_CDN_BASE,
    extractUuidFromUrl,
    validateUploadcareCredentials,
    getUploadcareHeaders
} from './uploadcare.config.js';
import { updateUploadcareMetrics } from './uploadcare.helpers.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';

/**
 * Delete file from Uploadcare using their REST API
 */
export const deleteUploadcareFile = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const { fileUrl, uuid, uploadcarePublicKey, uploadcareSecretKey } = req.body;
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

        // LAYER 1: Memory guard
        const memoryStart = Date.now();
        const memCheck = checkMemoryRateLimit(userId, 'delete');
        const memoryTime = Date.now() - memoryStart;

        if (!memCheck.allowed) {
            console.log(`[${requestId}] ❌ Blocked by memory guard in ${memoryTime}ms`);
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
            console.log(`[${requestId}] ❌ Blocked by Redis in ${redisTime}ms`);
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
                layer: redisLimit.layer
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
        // Note: Endpoint must end with /storage/ for deletion to work
        const deleteResponse = await fetch(`${UPLOADCARE_API_BASE}/files/${fileUuid}/storage/`, {
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

            updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0).catch(() => { });

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

        // Background updates
        updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0).catch(() => { });

        // Remove from upload logs (non-blocking)
        supabaseAdmin
            .from('upload_logs')
            .delete()
            .eq('file_url', fileUrl || `${UPLOADCARE_CDN_BASE}/${fileUuid}/`)
            .eq('api_key_id', apiKeyId)
            .then(() => { })
            .catch(err => console.error('Upload log delete error:', err));

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
            updateUploadcareMetrics(apiKeyId, req.userId, 'uploadcare', 'failed', 0).catch(() => { });
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during file deletion',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
