/**
 * Uploadcare Validation Module
 * File validation, SVG security, and project settings
 * 
 * Operations:
 * 1. validateUploadcareFile - Pre-upload validation (synchronous, fast)
 * 2. validateUploadcareSvg - SVG security check (detect malicious JavaScript)
 * 3. getUploadcareProjectSettings - Fetch project config (1-hour cache)
 */

import {
    UPLOADCARE_API_BASE,
    validateUploadcareCredentials,
    getUploadcareHeaders,
    extractUuidFromUrl
} from './uploadcare.config.js';
import { updateUploadcareMetrics } from './uploadcare.helpers.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';
import { checkRedisRateLimit } from './cache/redis-cache.js';
import redis from '../../../config/redis.js';

/**
 * Validate file before upload (fast, synchronous validation)
 */
export const validateUploadcareFile = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const {
            filename,
            contentType,
            fileSize,
            uploadcarePublicKey,
            uploadcareSecretKey,
            maxFileSize,
            allowedMimeTypes,
            blockMimeTypes,
            enableSvgValidation
        } = req.body;
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

        if (!filename || !contentType || !fileSize) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: 'filename, contentType, and fileSize are required'
            });
        }

        const validationStart = Date.now();

        const validationResults = {
            isValid: true,
            errors: [],
            warnings: [],
            fileInfo: {
                filename,
                contentType,
                fileSize,
                extension: filename.split('.').pop()?.toLowerCase() || ''
            }
        };

        // 1. File size validation
        const maxSize = maxFileSize || 5242880 * 1024 * 1024; // Default 5TB
        if (fileSize > maxSize) {
            validationResults.isValid = false;
            validationResults.errors.push(`File size (${fileSize} bytes) exceeds maximum (${maxSize} bytes)`);
        }

        // 2. MIME type validation
        if (allowedMimeTypes && allowedMimeTypes.length > 0) {
            if (!allowedMimeTypes.includes(contentType)) {
                validationResults.isValid = false;
                validationResults.errors.push(`MIME type '${contentType}' not in allowed list`);
            }
        }

        if (blockMimeTypes && blockMimeTypes.length > 0) {
            if (blockMimeTypes.includes(contentType)) {
                validationResults.isValid = false;
                validationResults.errors.push(`MIME type '${contentType}' is blocked`);
            }
        }

        // 3. SVG validation warning
        if (enableSvgValidation && contentType === 'image/svg+xml') {
            validationResults.warnings.push('SVG will be checked for JavaScript after upload');
        }

        // 4. Filename validation
        const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
        if (invalidChars.test(filename)) {
            validationResults.isValid = false;
            validationResults.errors.push('Filename contains invalid characters');
        }

        // 5. Dangerous extensions
        const dangerousExtensions = ['exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar'];
        if (dangerousExtensions.includes(validationResults.fileInfo.extension)) {
            validationResults.warnings.push(`Extension '${validationResults.fileInfo.extension}' may be dangerous`);
        }

        const validationTime = Date.now() - validationStart;
        const totalTime = Date.now() - startTime;

        // Background metrics
        updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0).catch(() => { });

        console.log(`[${requestId}] ✅ Validation complete in ${totalTime}ms (Valid: ${validationResults.isValid})`);

        res.status(200).json({
            success: true,
            message: 'File validation completed',
            data: {
                ...validationResults,
                provider: 'uploadcare',
                validationType: 'pre-upload'
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                validationTime: `${validationTime}ms`
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
            message: 'Internal server error during validation',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

/**
 * Get Uploadcare project settings (HEAVILY CACHED - 1 hour)
 */
export const getUploadcareProjectSettings = async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    let apiKeyId;

    try {
        const { uploadcarePublicKey, uploadcareSecretKey } = req.body;
        apiKeyId = req.apiKeyId;
        const userId = req.userId || apiKeyId;

        if (!apiKeyId) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'API key is required'
            });
        }

        // Validate credentials
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
        const memCheck = checkMemoryRateLimit(userId, 'project-settings');
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
        const redisLimit = await checkRedisRateLimit(userId, 'project-settings');
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

        // LAYER 3: Check Redis cache (1-hour TTL)
        const cacheKey = `uc_project:${uploadcarePublicKey}:settings`;
        const cachedSettings = await redis.get(cacheKey);

        if (cachedSettings) {
            const settingsData = JSON.parse(cachedSettings);
            const totalTime = Date.now() - startTime;

            console.log(`[${requestId}] 🎯 Settings from cache in ${totalTime}ms`);

            return res.status(200).json({
                success: true,
                message: 'Project settings retrieved from cache',
                data: {
                    ...settingsData,
                    cached: true
                },
                performance: {
                    requestId,
                    totalTime: `${totalTime}ms`,
                    cached: true
                }
            });
        }

        const operationStart = Date.now();

        // Get project settings from Uploadcare API
        const settingsResponse = await fetch('https://api.uploadcare.com/project/', {
            method: 'GET',
            headers: getUploadcareHeaders(uploadcarePublicKey, uploadcareSecretKey)
        });

        if (!settingsResponse.ok) {
            const errorText = await settingsResponse.text();
            updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0).catch(() => { });

            return res.status(settingsResponse.status).json({
                success: false,
                error: 'SETTINGS_RETRIEVAL_FAILED',
                message: 'Failed to retrieve project settings',
                details: errorText
            });
        }

        const projectSettings = await settingsResponse.json();

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        const responseData = {
            projectSettings,
            provider: 'uploadcare',
            settingsType: 'project-configuration'
        };

        // Cache for 1 hour (settings rarely change)
        await redis.setex(cacheKey, 3600, JSON.stringify(responseData));

        console.log(`[${requestId}] ✅ Settings retrieved in ${totalTime}ms`);

        // Background metrics
        updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0).catch(() => { });

        res.status(200).json({
            success: true,
            message: 'Project settings retrieved successfully',
            data: responseData,
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                breakdown: {
                    memoryGuard: `${memoryTime}ms`,
                    redisCheck: `${redisTime}ms`,
                    settingsRetrieval: `${operationTime}ms`
                },
                cached: false
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
            message: 'Internal server error during settings retrieval',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

/**
 * Validate SVG file for malicious JavaScript content
 */
export const validateUploadcareSvg = async (req, res) => {
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

        // Validate credentials
        const credValidation = validateUploadcareCredentials(uploadcarePublicKey, uploadcareSecretKey);
        if (!credValidation.valid) {
            return res.status(400).json({
                success: false,
                error: credValidation.error,
                message: credValidation.message
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

        // Extract UUID from URL
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

        // Get file info to check if it's SVG
        const fileInfoResponse = await fetch(`${UPLOADCARE_API_BASE}/files/${fileUuid}/`, {
            method: 'GET',
            headers: getUploadcareHeaders(uploadcarePublicKey, uploadcareSecretKey)
        });

        if (!fileInfoResponse.ok) {
            const errorText = await fileInfoResponse.text();
            updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0).catch(() => { });

            return res.status(fileInfoResponse.status).json({
                success: false,
                error: 'FILE_INFO_ERROR',
                message: 'Failed to get file information',
                details: errorText
            });
        }

        const fileInfo = await fileInfoResponse.json();

        // Check if file is SVG
        if (fileInfo.mime_type !== 'image/svg+xml') {
            return res.status(400).json({
                success: false,
                error: 'NOT_SVG_FILE',
                message: 'File is not an SVG file',
                actualType: fileInfo.mime_type
            });
        }

        // Download file content
        const fileContentResponse = await fetch(fileInfo.original_file_url);
        if (!fileContentResponse.ok) {
            updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'failed', 0).catch(() => { });
            return res.status(400).json({
                success: false,
                error: 'FILE_DOWNLOAD_ERROR',
                message: 'Failed to download file for validation'
            });
        }

        const fileContent = await fileContentResponse.text();

        // Check for malicious patterns
        const jsPatterns = [
            /<script[^>]*>[\s\S]*?<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe[^>]*>/gi,
            /<object[^>]*>/gi,
            /<embed[^>]*>/gi
        ];

        const validationResults = {
            isValid: true,
            hasJavaScript: false,
            detectedPatterns: [],
            securityRisk: false
        };

        for (const pattern of jsPatterns) {
            const matches = fileContent.match(pattern);
            if (matches) {
                validationResults.hasJavaScript = true;
                validationResults.isValid = false;
                validationResults.securityRisk = true;
                validationResults.detectedPatterns.push(...matches);
            }
        }

        const operationTime = Date.now() - operationStart;
        const totalTime = Date.now() - startTime;

        console.log(`[${requestId}] ✅ SVG validated in ${totalTime}ms (Safe: ${validationResults.isValid})`);

        // Background metrics
        updateUploadcareMetrics(apiKeyId, userId, 'uploadcare', 'success', 0).catch(() => { });

        res.status(200).json({
            success: true,
            message: 'SVG validation completed',
            data: {
                uuid: fileUuid,
                ...validationResults,
                provider: 'uploadcare',
                validationType: 'svg-security'
            },
            performance: {
                requestId,
                totalTime: `${totalTime}ms`,
                validationTime: `${operationTime}ms`
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
            message: 'Internal server error during SVG validation',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
