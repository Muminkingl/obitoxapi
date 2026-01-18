/**
 * Uploadcare File Download/Info
 * WITH ENTERPRISE MULTI-LAYER CACHING
 */

import {
    UPLOADCARE_API_BASE,
    UPLOADCARE_CDN_BASE,
    extractUuidFromUrl,
    validateUploadcareCredentials,
    getUploadcareHeaders
} from './uploadcare.config.js';
import {
    logFileUpload,
    updateUploadcareFileSize,
    updateUploadcareMetrics
} from './uploadcare.helpers.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';

// NEW: Analytics & Quota
import { checkUserQuota, trackApiUsage } from '../shared/analytics.new.js';

/**
 * Download file from Uploadcare (get file info and public URL)
 */
export const downloadUploadcareFile = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;
    let userId;

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
        const memCheck = checkMemoryRateLimit(userId, 'download');
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
        const redisLimit = await checkRedisRateLimit(userId, 'download');
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

        // Get file info from Uploadcare REST API
        const fileInfoResponse = await fetch(`${UPLOADCARE_API_BASE}/files/${fileUuid}/`, {
            method: 'GET',
            headers: getUploadcareHeaders(uploadcarePublicKey, uploadcareSecretKey)
        });

        if (!fileInfoResponse.ok) {
            const errorText = await fileInfoResponse.text();

            let errorType = 'FILE_INFO_ERROR';
            let statusCode = 500;

            if (fileInfoResponse.status === 404) {
                errorType = 'FILE_NOT_FOUND';
                statusCode = 404;
            } else if (fileInfoResponse.status === 403) {
                errorType = 'ACCESS_DENIED';
                statusCode = 403;
            }

            updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0).catch(() => { });

            return res.status(statusCode).json({
                success: false,
                error: errorType,
                message: 'Failed to get file info from Uploadcare',
                details: errorText
            });
        }

        const fileInfo = await fileInfoResponse.json();

        // Use actual CDN URL from API response
        const publicUrl = fileInfo.original_file_url || `${UPLOADCARE_CDN_BASE}/${fileUuid}/`;

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        // Background updates (non-blocking)
        updateUploadcareFileSize(apiKeyId, fileUuid, uploadcarePublicKey, uploadcareSecretKey).catch(() => { });
        updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0).catch(() => { });

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/uploadcare/download',
            method: 'POST',
            provider: 'uploadcare',
            operation: 'download',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Log file access (non-blocking)
        logFileUpload(
            apiKeyId,
            userId,
            'uploadcare',
            fileInfo.original_filename,
            fileInfo.mime_type,
            fileInfo.size,
            'success',
            publicUrl
        ).catch(() => { });

        console.log(`[${requestId}] ✅ SUCCESS in ${totalTime}ms`);

        // New Usage Tracking
        trackApiUsage({
            userId,
            endpoint: '/api/v1/upload/uploadcare/download',
            method: 'POST',
            provider: 'uploadcare',
            operation: 'download',
            statusCode: 200,
            success: true,
            requestCount: 1,
            apiKeyId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(200).json({
            success: true,
            message: 'File download info retrieved successfully',
            data: {
                downloadUrl: publicUrl,
                fileSize: fileInfo.size,
                contentType: fileInfo.mime_type,
                filename: fileInfo.original_filename,
                uuid: fileUuid,
                isPrivate: false, // Uploadcare files are public by default
                provider: 'uploadcare',
                metadata: {
                    originalFilename: fileInfo.original_filename,
                    mimeType: fileInfo.mime_type,
                    size: fileInfo.size,
                    uploadDate: fileInfo.datetime_uploaded,
                    lastModified: fileInfo.datetime_stored,
                    isImage: fileInfo.is_image,
                    isReady: fileInfo.is_ready,
                    originalFileUrl: fileInfo.original_file_url
                }
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
            updateUploadcareMetrics(apiKeyId, userId || apiKeyId, 'uploadcare', 'failed', 0).catch(() => { });

            trackApiUsage({
                userId: userId || apiKeyId,
                endpoint: '/api/v1/upload/uploadcare/download',
                method: 'POST',
                provider: 'uploadcare',
                operation: 'download',
                statusCode: 500,
                success: false,
                apiKeyId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        res.status(500).json({
            success: false,
            error: 'SERVER_ERROR',
            message: 'Internal server error during file download',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
