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
import logger from '../../../utils/logger.js';

// ✅ NEW: Import File Validator for server-side validation
import { validateFileMetadata } from '../../../utils/file-validator.js';

// Import multi-layer cache
import { checkMemoryRateLimit } from './cache/memory-guard.js';

// Quota check (OPT-2: prefer req.quotaChecked from MW2, fallback to Redis)
import { checkUserQuota } from '../shared/analytics.new.js';

// 🚀 REDIS METRICS: Single source of truth
import { updateRequestMetrics } from '../shared/metrics.helper.js';

// ✅ NEW: Import Webhook utilities (optional webhook support)
import { generateWebhookId, generateWebhookSecret } from '../../../utils/webhook/signature.js';
import { enqueueWebhook } from '../../../services/webhook/queue-manager.js';
import { supabaseAdmin } from '../../../config/supabase.js';

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

        // LAYER 2: QUOTA CHECK (OPT-2: use MW2 data if available, else fallback)
        const quotaCheck = req.quotaChecked || await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Monthly quota exceeded',
                limit: quotaCheck.limit,
                used: quotaCheck.current
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

        // ✅ NEW: VALIDATION: Server-side file validation (magic bytes from client)
        // CRITICAL: Client reads first 8 bytes and sends to backend - files NEVER hit backend!
        const { magicBytes, validation } = req.body;

        if (validation || magicBytes) {
            logger.debug('Running server-side file validation', { requestId });

            const validationResult = validateFileMetadata({
                filename,
                contentType,
                fileSize: fileSize || 0,
                magicBytes,
                validation: validation || {}
            });

            if (!validationResult.valid) {
                logger.warn('File validation failed', { requestId, errorCount: validationResult.errors?.length });
                updateRequestMetrics(apiKeyId, userId, 'uploadcare', false).catch(() => { });

                return res.status(400).json({
                    success: false,
                    provider: 'uploadcare',
                    error: 'VALIDATION_FAILED',
                    message: 'File validation failed',
                    validation: validationResult,
                    checks: validationResult.checks,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                });
            }

            logger.debug('Validation passed', { requestId, detectedMimeType: validationResult.detectedMimeType });
            if (validationResult.detectedMimeType) {
                logger.debug('Detected MIME type', { requestId, detectedMimeType: validationResult.detectedMimeType });
            }
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
        updateRequestMetrics(apiKeyId, userId, 'uploadcare', true, { fileSize: fileSize || 0, contentType })
            .catch(() => { });

        logger.info('Uploadcare signed URL generated', { requestId, totalTime });

        // ✅ NEW: WEBHOOK CREATION (Optional - same pattern as R2/Supabase)
        let webhookResult = null;
        const { webhook } = req.body;

        if (webhook && webhook.url) {
            logger.debug('Creating webhook for file', { requestId, filename });

            try {
                const webhookId = generateWebhookId();
                const webhookSecret = webhook.secret || generateWebhookSecret();

                const { data: insertedWebhook, error: insertError } = await supabaseAdmin.from('upload_webhooks').insert({
                    id: webhookId,
                    user_id: userId,
                    api_key_id: apiKeyId,
                    webhook_url: webhook.url,
                    webhook_secret: webhookSecret,
                    trigger_mode: webhook.trigger || 'manual',
                    provider: 'UPLOADCARE',
                    bucket: 'uploadcare-cdn',  // Uploadcare doesn't use buckets, but we need a value
                    file_key: uniqueFilename,
                    filename: filename,
                    content_type: contentType,
                    file_size: fileSize || 0,
                    etag: null,
                    status: 'pending',
                    metadata: webhook.metadata || {}
                }).select().single();

                if (insertError) {
                    logger.error('Webhook DB insert failed', { requestId, error: insertError.message });
                } else {
                    webhookResult = {
                        webhookId,
                        webhookSecret,
                        triggerMode: webhook.trigger || 'manual'
                    };
                    logger.debug('Webhook created', { requestId, webhookId });

                    // ✅ Queue webhook for auto-trigger mode (worker will process)
                    if ((webhook.trigger || 'manual') === 'auto') {
                        logger.debug('Enqueueing webhook for auto-trigger', { requestId, webhookId });
                        await enqueueWebhook(webhookId, insertedWebhook, 0);
                        logger.debug('Webhook enqueued to Redis', { requestId, webhookId });
                    }
                }
            } catch (webhookError) {
                logger.error('Webhook creation failed', { requestId, error: webhookError.message });
                // Continue without webhook - don't fail the entire request
            }
        }

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
                    validation: `${validationTime}ms`,
                    operation: `${operationTime}ms`
                }
            },
            // ✅ NEW: Webhook Result (only if webhook was requested)
            ...(webhookResult && { webhook: webhookResult })
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger.error('Uploadcare signed URL generation failed', { requestId, totalTime, error: error.message });

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
